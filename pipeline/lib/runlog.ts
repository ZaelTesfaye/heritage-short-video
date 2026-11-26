// runs.jsonl: one line per model call, plus one line per local render, cache hit and fallback.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./env.ts";

// PIPELINE_RUNS_FILE lets tests log somewhere other than the real run log.
export const RUNS_FILE = process.env.PIPELINE_RUNS_FILE ?? join(ROOT, "runs.jsonl");

/** One id per pipeline process, so all lines from a single command can be grouped. */
export const RUN_ID = process.env.PIPELINE_RUN_ID ?? randomUUID().slice(0, 8);

export type RunEvent =
  | "model_call" // a request to a hosted or remote model (one line per attempt)
  | "local_render" // a deterministic FFmpeg step
  | "cache_hit" // inputs unchanged, output reused, no call made
  | "fallback" // a planned model output was unavailable and a fallback was used
  | "remote_ingest" // a call that ran on Kaggle, copied in from the notebook's own log
  | "remote_job"; // one Kaggle notebook run as a whole: upload, queue, run and download

export interface RunEntry {
  stage: string;
  event: RunEvent;
  provider: string;
  model: string;
  status: "ok" | "error";
  latency_ms: number;
  shot?: string;
  lang?: string;
  aspect?: string;
  params?: Record<string, unknown>;
  seed?: number | null;
  attempt?: number;
  /** List-price equivalent in USD. Null when no public price applies (local work, free-only models). */
  cost_usd?: number | null;
  gpu_seconds?: number;
  input_hash?: string;
  output?: string;
  error?: string;
  note?: string;
  details?: Record<string, unknown>;
}

export function logRun(entry: RunEntry): void {
  const line = { ts: new Date().toISOString(), run_id: RUN_ID, ...entry };
  appendFileSync(RUNS_FILE, JSON.stringify(line) + "\n");
}
