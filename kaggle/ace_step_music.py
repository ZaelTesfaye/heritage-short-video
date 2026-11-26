# ACE-Step 1.5 score candidates, run on a Kaggle GPU by `npm run kaggle -- music`.
# The pipeline writes the job (caption, tempo, key, duration, one seed per candidate) into JOB below before upload.
# Each candidate is saved as soon as it finishes, and every model call is appended to results.jsonl,
# which the pipeline copies into runs.jsonl after downloading.
import inspect
import json
import os
import shutil
import subprocess
import sys
import time
import traceback

JOB = json.loads(r"""__JOB_JSON__""")
OUT = "/kaggle/working"
REPO = "/kaggle/tmp/ACE-Step-1.5"
RESULTS = os.path.join(OUT, "results.jsonl")


def log(entry):
    entry["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(RESULTS, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print("RESULT", json.dumps(entry), flush=True)


def gpu_name():
    try:
        return subprocess.check_output(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], text=True).strip().splitlines()[0]
    except Exception:
        return "unknown"


def sh(cmd, cwd=None):
    print("$", cmd, flush=True)
    subprocess.run(cmd, shell=True, check=True, cwd=cwd)


def setup():
    """Install with uv, as the ACE-Step README documents, into the repo's own environment."""
    os.makedirs("/kaggle/tmp", exist_ok=True)
    if not os.path.isdir(REPO):
        sh(f"git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git {REPO}")
    sh("pip install -q uv")
    sh("uv sync", cwd=REPO)


WORKER = r'''
import inspect, json, os, sys, time, traceback, shutil
sys.path.insert(0, os.getcwd())
job = json.load(open(sys.argv[1]))
out_dir = sys.argv[2]
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

def supported(fn, **kw):
    names = set(inspect.signature(fn).parameters)
    return {k: v for k, v in kw.items() if k in names}

dit = AceStepHandler()
init = dit.initialize_service
init(**supported(init, project_root=os.getcwd(), config_path="acestep-v15-turbo", device="cuda", offload_to_cpu=True))
llm = LLMHandler()
try:
    li = llm.initialize
    li(**supported(li, checkpoint_dir=os.path.join(os.getcwd(), "checkpoints"), lm_model_path="acestep-5Hz-lm-1.7B", backend="pt", device="cuda", offload_to_cpu=True))
    print("LLM planner initialised", flush=True)
except Exception as e:
    print("LLM planner not initialised, continuing DiT-only:", e, flush=True)

for cand in job["candidates"]:
    started = time.time()
    entry = {"provider": "kaggle", "model": job["model"], "shot": cand["id"], "seed": cand["seed"],
             "params": {"caption": job["caption"], "bpm": job["bpm"], "key": job["key"], "duration_s": job["duration_s"], "instrumental": True, "inference_steps": 8, "shift": 3.0}}
    try:
        p = GenerationParams(**supported(GenerationParams, caption=job["caption"], lyrics="[Instrumental]", instrumental=True,
                                          bpm=job["bpm"], keyscale=job["key"], timesignature="4", duration=float(job["duration_s"]),
                                          seed=cand["seed"], inference_steps=8, shift=3.0, thinking=False))
        c = GenerationConfig(**supported(GenerationConfig, batch_size=1, use_random_seed=False, seeds=[cand["seed"]], audio_format="wav"))
        tmp = os.path.join(out_dir, "raw", cand["id"])
        os.makedirs(tmp, exist_ok=True)
        r = generate_music(dit, llm, p, c, save_dir=tmp)
        if not r.success:
            raise RuntimeError(str(r.error))
        audio = r.audios[0]
        dest = os.path.join(out_dir, "music", "candidates", cand["id"] + ".wav")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if audio.get("path") and os.path.exists(audio["path"]) and audio["path"].endswith(".wav"):
            shutil.copy(audio["path"], dest)
        else:
            import soundfile as sf
            t = audio["tensor"]
            sf.write(dest, t.numpy().T if t.dim() == 2 else t.numpy(), audio.get("sample_rate", 48000))
        entry.update(status="ok", output="outputs/music/candidates/" + cand["id"] + ".wav")
    except Exception as e:
        traceback.print_exc()
        entry.update(status="error", error=str(e)[:800])
    entry["latency_s"] = round(time.time() - started, 2)
    entry["gpu_seconds"] = entry["latency_s"]
    print("CANDIDATE", json.dumps(entry), flush=True)
    with open(os.path.join(out_dir, "worker_results.jsonl"), "a") as f:
        f.write(json.dumps(entry) + "\n")
'''


def main():
    gpu = gpu_name()
    print("GPU:", gpu, flush=True)
    t0 = time.time()
    try:
        setup()
    except Exception as e:
        log({"provider": "kaggle", "model": JOB["model"], "shot": "setup", "status": "error", "error": str(e)[:800], "latency_s": round(time.time() - t0, 2), "gpu": gpu})
        raise
    setup_s = round(time.time() - t0, 2)
    print(f"setup took {setup_s}s", flush=True)

    job_file = os.path.join(OUT, "job.json")
    with open(job_file, "w") as f:
        json.dump(JOB, f)
    worker = os.path.join(REPO, "heritage_worker.py")
    with open(worker, "w") as f:
        f.write(WORKER)
    proc = subprocess.run(f"uv run python heritage_worker.py {job_file} {OUT}", shell=True, cwd=REPO)

    worker_results = os.path.join(OUT, "worker_results.jsonl")
    lines = open(worker_results).read().splitlines() if os.path.exists(worker_results) else []
    for line in lines:
        entry = json.loads(line)
        entry["gpu"] = gpu
        entry["note_setup_s"] = setup_s
        log(entry)
    if not lines:
        log({"provider": "kaggle", "model": JOB["model"], "shot": "worker", "status": "error", "error": f"worker exited with code {proc.returncode} and produced no candidates", "latency_s": round(time.time() - t0, 2), "gpu": gpu})
    shutil.rmtree(os.path.join(OUT, "raw"), ignore_errors=True)
    # The local connection is slow: ship 192 kbps MP3 (about 2 MB) instead of a 16 MB WAV.
    cand_dir = os.path.join(OUT, "music", "candidates")
    for name in sorted(os.listdir(cand_dir)) if os.path.isdir(cand_dir) else []:
        if name.endswith(".wav"):
            src = os.path.join(cand_dir, name)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-b:a", "192k", src[:-4] + ".mp3"], check=True)
            os.remove(src)


main()
