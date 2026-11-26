// Measurement: summarises runs.jsonl into latency, GPU time and list-price cost per stage and per model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, isMain, rel, runMain } from "./lib/env.ts";
import { RUNS_FILE } from "./lib/runlog.ts";

interface Row {
  calls_ok: number;
  calls_failed: number;
  cache_hits: number;
  local_renders: number;
  fallbacks: number;
  model_latency_ms: number;
  local_latency_ms: number;
  gpu_seconds: number;
  cost_usd: number;
}

const emptyRow = (): Row => ({ calls_ok: 0, calls_failed: 0, cache_hits: 0, local_renders: 0, fallbacks: 0, model_latency_ms: 0, local_latency_ms: 0, gpu_seconds: 0, cost_usd: 0 });

function table(title: string, rows: Map<string, Row>): string {
  const lines = [
    `### ${title}`,
    "",
    "| | Model calls ok | Failed attempts | Cache hits | Local renders | Fallbacks | Model latency total (s) | Mean per call (s) | Local and Kaggle-job wall time (s) | GPU minutes | List-price equivalent (USD) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const [name, r] of rows) {
    const mean = r.calls_ok ? (r.model_latency_ms / r.calls_ok / 1000).toFixed(2) : "-";
    lines.push(`| ${name} | ${r.calls_ok} | ${r.calls_failed} | ${r.cache_hits} | ${r.local_renders} | ${r.fallbacks} | ${(r.model_latency_ms / 1000).toFixed(1)} | ${mean} | ${(r.local_latency_ms / 1000).toFixed(1)} | ${(r.gpu_seconds / 60).toFixed(2)} | ${r.cost_usd.toFixed(5)} |`);
  }
  return lines.join("\n");
}

export async function runCosts(): Promise<void> {
  if (!existsSync(RUNS_FILE)) throw new Error("runs.jsonl does not exist yet. Run the pipeline first.");
  const entries = readFileSync(RUNS_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

  const byStage = new Map<string, Row>();
  const byModel = new Map<string, Row>();
  const bump = (map: Map<string, Row>, key: string, entry: any) => {
    const row = map.get(key) ?? emptyRow();
    map.set(key, row);
    if (entry.event === "cache_hit") row.cache_hits++;
    else if (entry.event === "remote_job") {
      // Whole Kaggle runs: queue, install, download. Counted as wall time, not as model calls.
      row.local_latency_ms += entry.latency_ms ?? 0;
    }
    else if (entry.event === "fallback") row.fallbacks++;
    else if (entry.event === "local_render") {
      row.local_renders++;
      row.local_latency_ms += entry.latency_ms ?? 0;
    } else if (entry.status === "ok") {
      // Successful hosted calls and calls ingested from Kaggle.
      row.calls_ok++;
      row.model_latency_ms += entry.latency_ms ?? 0;
      row.gpu_seconds += entry.gpu_seconds ?? 0;
      row.cost_usd += entry.cost_usd ?? 0;
    } else {
      row.calls_failed++;
    }
  };
  for (const entry of entries) {
    bump(byStage, entry.stage, entry);
    if (entry.event === "model_call" || entry.event === "remote_ingest") bump(byModel, `${entry.provider} / ${entry.model}`, entry);
  }

  const first = entries[0]?.ts ?? "-";
  const last = entries[entries.length - 1]?.ts ?? "-";
  const summary = [`Generated from ${entries.length} lines of runs.jsonl (${first} to ${last}).`, "", table("Per stage", byStage), "", table("Per model", byModel), ""].join("\n");

  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "costs_summary.md");
  writeFileSync(file, summary);
  console.log(summary);
  console.log(`[costs] written to ${rel(file)}`);
}

if (isMain(import.meta.url)) runMain(runCosts);
