// Content-addressed caching: an output is reused only while the hash of everything that produced it is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OUT, ensureDir, readJson, rel, writeJson } from "./env.ts";
import { logRun } from "./runlog.ts";

const MANIFEST = join(OUT, "cache.json");

interface ManifestEntry {
  hash: string;
  stage: string;
  created_at: string;
}
type Manifest = Record<string, ManifestEntry>;

function readManifest(): Manifest {
  return existsSync(MANIFEST) ? readJson<Manifest>(MANIFEST) : {};
}

/** JSON with object keys sorted, so the same inputs always produce the same string. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashInputs(inputs: unknown): string {
  return createHash("sha256").update(stableStringify(inputs)).digest("hex").slice(0, 16);
}

/** Hash of a file's bytes. Used as an input, so a changed upstream file invalidates everything downstream. */
export function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

export interface CacheSpec {
  stage: string;
  /** Absolute path of the file this step produces. */
  output: string;
  /** Everything that determines the output: prompts, seeds, model, parameters, upstream file hashes. */
  inputs: unknown;
  shot?: string;
  lang?: string;
  aspect?: string;
  force?: boolean;
}

/**
 * Runs `produce` only if `output` is missing or was made from different inputs.
 * Returns true on a cache hit. `produce` receives the input hash so it can log it.
 */
export async function cached(spec: CacheSpec, produce: (inputHash: string) => Promise<void>): Promise<boolean> {
  const key = rel(spec.output);
  const hash = hashInputs(spec.inputs);
  const entry = readManifest()[key];
  if (!spec.force && entry?.hash === hash && existsSync(spec.output)) {
    logRun({
      stage: spec.stage,
      event: "cache_hit",
      provider: "cache",
      model: "-",
      status: "ok",
      latency_ms: 0,
      shot: spec.shot,
      lang: spec.lang,
      aspect: spec.aspect,
      input_hash: hash,
      output: key,
    });
    return true;
  }
  ensureDir(dirname(spec.output));
  await produce(hash);
  if (!existsSync(spec.output)) throw new Error(`${spec.stage}: step finished but ${key} was not written`);
  // Re-read before writing so a manifest changed by an earlier step in this run is not overwritten.
  const manifest = readManifest();
  manifest[key] = { hash, stage: spec.stage, created_at: new Date().toISOString() };
  writeJson(MANIFEST, manifest);
  return false;
}

/** Remembers that a one-off event (such as ingesting a remote log line) was handled. Returns false if already seen. */
export function markOnce(key: string, hash: string, stage: string): boolean {
  const manifest = readManifest();
  if (manifest[key]?.hash === hash) return false;
  manifest[key] = { hash, stage, created_at: new Date().toISOString() };
  writeJson(MANIFEST, manifest);
  return true;
}
