// Kaggle hand-off. GPU stages cannot run on a laptop, so the pipeline writes a job file, a notebook runs it,
// and the notebook's own log of each model call is copied into runs.jsonl exactly once.
import { existsSync, readFileSync } from "node:fs";
import { rel } from "./env.ts";
import { hashInputs, markOnce } from "./cache.ts";
import { logRun } from "./runlog.ts";

export function ingestRemoteRuns(resultsFile: string, stage: string): number {
  if (!existsSync(resultsFile)) return 0;
  let added = 0;
  const lines = readFileSync(resultsFile, "utf8").split("\n").filter((line) => line.trim());
  lines.forEach((line, index) => {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      console.warn(`  ! ${rel(resultsFile)} line ${index + 1} is not valid JSON; skipped`);
      return;
    }
    if (!markOnce(`remote:${rel(resultsFile)}#${index}`, hashInputs(entry), stage)) return;
    logRun({
      stage,
      event: "remote_ingest",
      provider: entry.provider ?? "kaggle",
      model: entry.model ?? "unknown",
      status: entry.status === "error" ? "error" : "ok",
      latency_ms: Math.round((entry.latency_s ?? 0) * 1000),
      gpu_seconds: entry.gpu_seconds ?? entry.latency_s,
      shot: entry.shot,
      aspect: entry.aspect,
      seed: entry.seed ?? null,
      params: entry.params,
      input_hash: entry.input_hash,
      output: entry.output,
      error: entry.error,
      cost_usd: null,
      note: `ran on ${entry.gpu ?? "a remote GPU"} at ${entry.ts ?? "an unrecorded time"}`,
    });
    added++;
  });
  return added;
}
