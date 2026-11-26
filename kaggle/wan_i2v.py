# Wan 2.2 TI2V-5B image-to-video clips, run on a Kaggle T4 by `npm run kaggle -- video`.
# Keyframes arrive as a private Kaggle dataset; the job (prompts, seeds, input hashes) is written into JOB below.
# Each clip is saved as soon as it finishes, with a .json beside it carrying the input hash, so the local
# pipeline uses a clip only while its keyframe, prompt and seed are unchanged. One results.jsonl line per call.
import gc
import glob
import json
import os
import subprocess
import sys
import time
import traceback

JOB = json.loads(r"""__JOB_JSON__""")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
OUT = "/kaggle/working"
RESULTS = os.path.join(OUT, "results.jsonl")
MODEL_ID = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"

# Draft settings for a 16 GB T4: about 2 seconds at 480p-class resolution, multiples of 32, frames = 4k + 1.
SIZES = {"vertical": (832, 480), "horizontal": (480, 832)}  # (height, width)
NUM_FRAMES = 49
STEPS = 20
GUIDANCE = 5.0
FPS = 24
NEGATIVE = "blurry, distorted face, deformed hands, extra fingers, flicker, morphing, text, letters, watermark, static, overexposed"


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


def find_keyframe(name):
    hits = glob.glob(f"/kaggle/input/**/{name}", recursive=True)
    if not hits:
        raise FileNotFoundError(f"{name} not found under /kaggle/input")
    return hits[0]


def main():
    gpu = gpu_name()
    print("GPU:", gpu, flush=True)
    t0 = time.time()
    # Wan 2.2 TI2V needs diffusers from its main branch, per the model card.
    subprocess.run("pip install -q git+https://github.com/huggingface/diffusers transformers accelerate ftfy imageio imageio-ffmpeg sentencepiece", shell=True, check=True)
    import numpy as np
    import torch
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
    from diffusers.utils import export_to_video, load_image

    dtype = torch.float16  # the T4 has no native bf16
    # Two stages, so the text encoder and the video model are never in memory together. Loading both at once
    # ran out of GPU memory on the first attempt and got the process killed for system memory on the second.
    embeds = {}
    try:
        # Stage A: text encoder only. Encode every prompt, then free it completely.
        text_pipe = WanImageToVideoPipeline.from_pretrained(MODEL_ID, transformer=None, vae=None, torch_dtype=dtype)
        text_pipe.text_encoder.to("cuda")
        with torch.no_grad():
            for job in JOB["jobs"]:
                pe, ne = text_pipe.encode_prompt(prompt=job["prompt"], negative_prompt=NEGATIVE, do_classifier_free_guidance=True, device="cuda")
                embeds[job["shot"] + job["aspect"]] = (pe.cpu(), ne.cpu())
        del text_pipe
        gc.collect()
        torch.cuda.empty_cache()
        print(f"prompts encoded at {round(time.time() - t0, 1)}s", flush=True)

        # Stage B: video model and VAE only.
        vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
        pipe = WanImageToVideoPipeline.from_pretrained(MODEL_ID, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=dtype)
        pipe.enable_model_cpu_offload()
        if hasattr(pipe.vae, "enable_tiling"):
            pipe.vae.enable_tiling()
    except Exception as e:
        traceback.print_exc()
        log({"provider": "kaggle", "model": MODEL_ID, "shot": "load", "status": "error", "error": str(e)[:800], "latency_s": round(time.time() - t0, 2), "gpu": gpu})
        return
    load_s = round(time.time() - t0, 2)
    print(f"model loaded in {load_s}s", flush=True)

    for job in JOB["jobs"]:
        started = time.time()
        height, width = SIZES[job["aspect"]]
        entry = {"provider": "kaggle", "model": MODEL_ID, "shot": job["shot"], "aspect": job["aspect"], "seed": job["seed"],
                 "input_hash": job["input_hash"], "gpu": gpu, "note_load_s": load_s,
                 "params": {"prompt": job["prompt"], "height": height, "width": width, "num_frames": NUM_FRAMES, "steps": STEPS, "guidance": GUIDANCE, "dtype": "float16", "offload": "model_cpu", "staged_text_encoder": True}}
        try:
            image = load_image(find_keyframe(job["keyframe_file"])).resize((width, height))
            generator = torch.Generator(device="cpu").manual_seed(int(job["seed"]))
            prompt_embeds, negative_embeds = (t.to("cuda") for t in embeds[job["shot"] + job["aspect"]])
            frames = pipe(image=image, prompt_embeds=prompt_embeds, negative_prompt_embeds=negative_embeds, height=height, width=width,
                          num_frames=NUM_FRAMES, num_inference_steps=STEPS, guidance_scale=GUIDANCE, generator=generator).frames[0]
            arr = np.asarray(frames, dtype=np.float32)
            if not np.isfinite(arr).all() or arr.mean() < 0.01:
                raise RuntimeError(f"clip is blank or contains NaN (mean {float(np.nan_to_num(arr).mean()):.4f}); fp16 overflow is the likely cause")
            dest = os.path.join(OUT, "clips", job["aspect"], job["shot"] + ".mp4")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            export_to_video(frames, dest, fps=FPS)
            with open(dest[:-4] + ".json", "w") as f:
                json.dump({"input_hash": job["input_hash"], "model": MODEL_ID, "seed": job["seed"], "prompt": job["prompt"], "frames": NUM_FRAMES, "fps": FPS, "size": [width, height]}, f)
            entry.update(status="ok", output=job["output"])
        except Exception as e:
            traceback.print_exc()
            entry.update(status="error", error=str(e)[:800])
        entry["latency_s"] = round(time.time() - started, 2)
        entry["gpu_seconds"] = entry["latency_s"]
        log(entry)
        gc.collect()
        torch.cuda.empty_cache()


main()
