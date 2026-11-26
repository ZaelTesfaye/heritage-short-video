// Paths, configuration, environment variables and command-line options shared by every stage.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// PIPELINE_OUTPUT_DIR lets tests run the stages against a throwaway folder.
export const OUT = process.env.PIPELINE_OUTPUT_DIR ? resolve(process.env.PIPELINE_OUTPUT_DIR) : join(ROOT, "outputs");

export type Aspect = "vertical" | "horizontal";
export const ALL_ASPECTS: Aspect[] = ["vertical", "horizontal"];

export interface AspectConfig {
  width: number;
  height: number;
  keyframe: { width: number; height: number };
  subtitle: { font_size: number; margin_v: number; margin_h: number };
}

export interface Config {
  models: {
    tts: { provider: string; model: string; fallback_models?: string[]; min_interval_ms: number };
    text: { provider: string; model: string };
    image: { provider: string; model: string; steps: number };
    video: { provider: string; model: string; clip_seconds: number; draft_resolution: string };
    music: { provider: string; model: string };
  };
  aspects: Record<Aspect, AspectConfig>;
  retry: { max_attempts: number; base_delay_ms: number; max_delay_ms: number };
  audio: {
    voice_lufs: number;
    music_lufs: number;
    music_gain_db: number;
    duck: { threshold: number; ratio: number; attack_ms: number; release_ms: number };
    master_lufs: number;
    master_true_peak_db: number;
    music_fade_in_s: number;
    music_fade_out_s: number;
  };
  video: { crf: number; preset: string; kenburns_supersample: number };
  pricing: Record<string, any>;
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path relative to the repository root with forward slashes, for logs and manifests. */
export function rel(path: string): string {
  return relative(ROOT, path).replaceAll("\\", "/");
}

let config: Config | null = null;
export function loadConfig(): Config {
  config ??= readJson<Config>(join(ROOT, "pipeline.config.json"));
  return config;
}

let envLoaded = false;
/** Loads .env once. Secrets live only there; .env is git-ignored. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = join(ROOT, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in (see README, "Setup").`);
  }
  return value;
}

export interface StageOptions {
  /** Narration language code. Undefined means the storyboard's default language. */
  lang?: string;
  aspects: Aspect[];
  /** Restrict per-shot work to these shot ids. Null means every shot. */
  only: string[] | null;
  /** Ignore the cache and regenerate. */
  force: boolean;
  /** Also run the GPU stages on Kaggle (music, image-to-video) before assembling. */
  remote: boolean;
  positionals: string[];
}

export function parseStageArgs(argv: string[] = process.argv.slice(2)): StageOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      lang: { type: "string" },
      aspect: { type: "string", default: "both" },
      only: { type: "string" },
      force: { type: "boolean", default: false },
      remote: { type: "boolean", default: false },
    },
  });
  const aspect = values.aspect as string;
  if (aspect !== "both" && !ALL_ASPECTS.includes(aspect as Aspect)) {
    throw new Error(`--aspect must be vertical, horizontal or both (got "${aspect}")`);
  }
  return {
    lang: values.lang,
    aspects: aspect === "both" ? ALL_ASPECTS : [aspect as Aspect],
    only: values.only ? values.only.split(",").map((s) => s.trim()) : null,
    force: values.force as boolean,
    remote: values.remote as boolean,
    positionals,
  };
}

/** True when the module at `metaUrl` is the script Node was started with. */
export function isMain(metaUrl: string): boolean {
  return !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === metaUrl;
}

/** Runs a stage's main function and exits non-zero with a readable message on failure. */
export function runMain(main: () => Promise<unknown>): void {
  main().catch((error: unknown) => {
    console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
