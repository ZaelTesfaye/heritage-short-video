// Runs a GPU stage on Kaggle from this machine: uploads the job, starts it on a T4, waits, downloads the results
// into outputs/, and copies the notebook's own call log into runs.jsonl.
//   npm run kaggle -- music          ACE-Step score candidates
//   npm run kaggle -- video          Wan 2.2 image-to-video clips for shots marked "i2v"
//   npm run kaggle -- video --only s08,s04 --aspect vertical
// Needs KAGGLE_API_TOKEN (or ~/.kaggle/access_token) and the Kaggle CLI: `pip install kaggle`.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { OUT, ROOT, isMain, loadEnv, parseStageArgs, readJson, rel, runMain, sleep, writeJson } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { paths } from "./lib/paths.ts";
import { logRun } from "./lib/runlog.ts";
import { ffmpeg } from "./lib/ffmpeg.ts";
import { loadStoryboard } from "./lib/storyboard.ts";
import { runMusic } from "./music.ts";
import { writeVideoJobs } from "./shots.ts";

const POLL_MS = 30_000;
const DEFAULT_TIMEOUT_MIN = 90;

function kaggle(args: string[], options: { allowFail?: boolean } = {}): string {
  loadEnv();
  const python = process.env.KAGGLE_PYTHON || "python";
  const result = spawnSync(python, ["-m", "kaggle", ...args], { encoding: "utf8", env: process.env, windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 && !options.allowFail) throw new Error(`kaggle ${args.join(" ")} failed:\n${output.slice(-1500)}`);
  return output;
}

function username(): string {
  loadEnv();
  if (process.env.KAGGLE_USERNAME) return process.env.KAGGLE_USERNAME;
  const match = /username:\s*(\S+)/.exec(kaggle(["config", "view"]));
  if (!match || match[1] === "None") throw new Error("Could not find the Kaggle username. Set KAGGLE_USERNAME in .env.");
  return match[1];
}

interface KernelSpec {
  kind: "music" | "video";
  slug: string;
  title: string;
  script: string;
  datasets: string[];
}

function pushKernel(spec: KernelSpec, dir: string): void {
  const user = username();
  writeFileSync(join(dir, "script.py"), spec.script);
  const metadata: Record<string, unknown> = {
    id: `${user}/${spec.slug}`,
    title: spec.title,
    code_file: "script.py",
    language: "python",
    kernel_type: "script",
    is_private: true,
    enable_gpu: true,
    enable_internet: true,
    dataset_sources: spec.datasets,
    competition_sources: [],
    kernel_sources: [],
    // Recent PyTorch builds no longer support the older P100, so ask for a T4.
    machine_shape: "NvidiaTeslaT4",
  };
  writeJson(join(dir, "kernel-metadata.json"), metadata);
  console.log(`[kaggle] pushing ${user}/${spec.slug}`);
  console.log(kaggle(["kernels", "push", "-p", dir]).split("\n").slice(-3).join("\n"));
}

async function waitForKernel(ref: string, timeoutMin: number): Promise<string> {
  const deadline = Date.now() + timeoutMin * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const status = kaggle(["kernels", "status", ref], { allowFail: true });
    const state = /status "?([\w.]+)"?/i.exec(status)?.[1] ?? status.slice(-80);
    if (state !== last) console.log(`[kaggle] ${ref}: ${state}`);
    last = state;
    if (/complete/i.test(state)) return "complete";
    if (/error|cancel/i.test(state)) return state;
  }
  return "timeout";
}

/** Uploads keyframes for image-to-video as a private dataset, creating it the first time and versioning it after. */
function uploadDataset(slug: string, title: string, files: { from: string; name: string }[], jobFile: string): string {
  const user = username();
  // A fresh folder per upload: an interrupted upload can leave the previous one locked on Windows.
  const dir = join(OUT, "kaggle", "dataset", `${slug}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (const file of files) copyFileSync(file.from, join(dir, file.name));
  copyFileSync(jobFile, join(dir, "job.json"));
  writeJson(join(dir, "dataset-metadata.json"), { title, id: `${user}/${slug}`, licenses: [{ name: "CC0-1.0" }] });
  const exists = !/not found|404/i.test(kaggle(["datasets", "status", `${user}/${slug}`], { allowFail: true }));
  console.log(`[kaggle] ${exists ? "updating" : "creating"} dataset ${user}/${slug} (${files.length} keyframes)`);
  const out = exists
    ? kaggle(["datasets", "version", "-p", dir, "-m", `keyframes ${new Date().toISOString()}`, "-q"])
    : kaggle(["datasets", "create", "-p", dir, "-q"]);
  console.log(out.split("\n").slice(-2).join("\n"));
  return `${user}/${slug}`;
}

async function waitForDataset(ref: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const status = kaggle(["datasets", "status", ref], { allowFail: true });
    if (/ready/i.test(status)) return;
    await sleep(15_000);
  }
  throw new Error(`Dataset ${ref} did not become ready`);
}

/** Copies one downloaded results log into the stage's results file, rewriting nothing, so ingest stays once-only. */
function collectResults(pulled: string, resultsFile: string): number {
  const source = join(pulled, "results.jsonl");
  if (!existsSync(source)) return 0;
  const lines = readFileSync(source, "utf8").split("\n").filter((l) => l.trim());
  mkdirSync(dirname(resultsFile), { recursive: true });
  const existing = existsSync(resultsFile) ? readFileSync(resultsFile, "utf8") : "";
  const fresh = lines.filter((line) => !existing.includes(line));
  if (fresh.length) appendFileSync(resultsFile, fresh.join("\n") + "\n");
  return fresh.length;
}

/** Downloads a notebook's outputs, retrying while the client leaves .kaggle-partial files behind. */
function downloadOutput(ref: string, dir: string): void {
  for (let attempt = 1; attempt <= 4; attempt++) {
    kaggle(["kernels", "output", ref, "-p", dir, "-o"], { allowFail: true });
    const partial = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".kaggle-partial"));
    if (!partial.length) return;
    console.warn(`[kaggle] download incomplete (${partial.length} partial file(s)); retrying`);
    for (const f of partial) rmSync(join(dir, f), { force: true });
  }
}

async function runRemote(spec: KernelSpec, timeoutMin: number): Promise<string> {
  const pushDir = join(OUT, "kaggle", "push", spec.kind);
  rmSync(pushDir, { recursive: true, force: true });
  mkdirSync(pushDir, { recursive: true });
  const ref = `${username()}/${spec.slug}`;
  const started = Date.now();
  pushKernel(spec, pushDir);
  const state = await waitForKernel(ref, timeoutMin);
  const pulled = join(OUT, "kaggle", "pull", spec.kind);
  rmSync(pulled, { recursive: true, force: true });
  mkdirSync(pulled, { recursive: true });
  downloadOutput(ref, pulled);
  logRun({
    stage: spec.kind === "music" ? "music" : "shots",
    event: "remote_job",
    provider: "kaggle",
    model: `kernel:${ref}`,
    status: state === "complete" ? "ok" : "error",
    latency_ms: Date.now() - started,
    note: `Kaggle notebook run ended with "${state}"; the model calls inside it are logged separately as remote_ingest`,
    error: state === "complete" ? undefined : `kernel ended with ${state}; its log is in ${rel(pulled)}`,
  });
  console.log(`[kaggle] ${ref} ended: ${state}; outputs in ${rel(pulled)}`);
  return pulled;
}

export async function runKaggleMusic(opts: StageOptions, timeoutMin = DEFAULT_TIMEOUT_MIN): Promise<void> {
  await runMusic(opts); // writes the current job file
  const job = readJson(paths.kaggleMusicJob());
  const template = readFileSync(join(ROOT, "kaggle", "ace_step_music.py"), "utf8");
  const script = template.replace("__JOB_JSON__", JSON.stringify(job));
  const pulled = await runRemote({ kind: "music", slug: "heritage-short-music", title: "heritage-short-music", script, datasets: [] }, timeoutMin);

  const candidates = join(pulled, "music", "candidates");
  if (existsSync(candidates)) {
    mkdirSync(dirname(paths.musicCandidate("x")), { recursive: true });
    for (const file of readdirSync(candidates).filter((f) => /\.(wav|mp3)$/.test(f))) {
      const id = basename(file).replace(/\.(wav|mp3)$/, "");
      if (file.endsWith(".wav")) copyFileSync(join(candidates, file), paths.musicCandidate(id));
      else await ffmpeg(["-i", join(candidates, file), "-ar", "48000", "-c:a", "pcm_s16le", paths.musicCandidate(id)]);
    }
  }
  const added = collectResults(pulled, paths.musicResults());
  await runMusic(opts); // ingests the results into runs.jsonl
  console.log(`[kaggle] music: ${added} result line(s) collected`);
}

export async function runKaggleVideo(opts: StageOptions, timeoutMin = DEFAULT_TIMEOUT_MIN): Promise<void> {
  const sb = loadStoryboard();
  const wanted = sb.shots.filter((s) => s.motion.mode === "i2v" && (!opts.only || opts.only.includes(s.id)));
  const jobsFile = paths.kaggleVideoJobs();
  writeVideoJobs(sb); // one job per i2v shot whose keyframe exists, with its current input hash
  const all = readJson<any>(jobsFile);
  const jobs = all.jobs.filter((j: any) => wanted.some((s) => s.id === j.shot) && opts.aspects.includes(j.aspect));
  // Skip clips that already exist for the current keyframe, prompt and seed.
  const todo = jobs.filter((j: any) => {
    const meta = join(ROOT, j.meta);
    return !(existsSync(meta) && readJson<any>(meta).input_hash === j.input_hash && existsSync(join(ROOT, j.output)));
  });
  if (!todo.length) {
    console.log("[kaggle] video: every requested clip is already up to date");
    return;
  }
  const subJob = { ...all, jobs: todo.map((j: any) => ({ ...j, keyframe_file: `${j.aspect}_${j.shot}.png` })) };
  const jobFile = join(OUT, "kaggle", "video_job_upload.json");
  writeJson(jobFile, subJob);
  const dataset = uploadDataset("heritage-short-keyframes", "heritage-short-keyframes", todo.map((j: any) => ({ from: join(ROOT, j.keyframe), name: `${j.aspect}_${j.shot}.png` })), jobFile);
  await waitForDataset(dataset);

  const script = readFileSync(join(ROOT, "kaggle", "wan_i2v.py"), "utf8").replace("__JOB_JSON__", JSON.stringify(subJob));
  const pulled = await runRemote({ kind: "video", slug: "heritage-short-video", title: "heritage-short-video", script, datasets: [dataset] }, timeoutMin);

  const clips = join(pulled, "clips");
  if (existsSync(clips)) cpSync(clips, join(OUT, "clips"), { recursive: true });
  const added = collectResults(pulled, paths.clipResults());
  console.log(`[kaggle] video: ${added} result line(s) collected; run \`npm run film\` to cut them in`);
}

async function main(): Promise<void> {
  const opts = parseStageArgs();
  const kind = opts.positionals[0];
  if (kind === "music") await runKaggleMusic(opts);
  else if (kind === "video") await runKaggleVideo(opts);
  else throw new Error('Use: npm run kaggle -- music   or   npm run kaggle -- video [--only s04,s08] [--aspect vertical]');
}

if (isMain(import.meta.url)) runMain(main);
