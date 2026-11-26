// The single doorway for hosted model calls: retries with backoff, and a runs.jsonl line per attempt.
import { loadConfig, sleep } from "./env.ts";
import { logRun } from "./runlog.ts";

export class HttpError extends Error {
  status: number;
  retryAfterMs: number | null;
  body: string;

  constructor(status: number, body: string, retryAfterMs: number | null = null) {
    super(`HTTP ${status}: ${body.slice(0, 400)}`);
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Builds an HttpError from a failed fetch Response, reading the provider's retry hint if it gave one. */
export async function httpError(response: Response): Promise<HttpError> {
  const body = await response.text().catch(() => "");
  let retryAfterMs: number | null = null;
  const header = response.headers.get("retry-after");
  if (header && !Number.isNaN(Number(header))) retryAfterMs = Number(header) * 1000;
  // Gemini puts its hint in the JSON body: "retryDelay": "34s"
  const hinted = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (hinted) retryAfterMs = Math.ceil(Number(hinted[1]) * 1000);
  return new HttpError(response.status, body, retryAfterMs);
}

/**
 * A 429 whose limit is per day, or whose suggested wait is longer than an hour, will not clear by waiting.
 * Retrying it only burns time, so the caller should switch model or stop.
 */
export function isQuotaExhausted(error: unknown): boolean {
  if (!(error instanceof HttpError) || error.status !== 429) return false;
  return /per day|requests per day|daily/i.test(error.body) || (error.retryAfterMs ?? 0) > 3_600_000 || /retry in \d+h/i.test(error.body);
}

/** Rate limits, timeouts, server errors and dropped connections are worth retrying. Bad requests and spent daily quotas are not. */
export function isRetryable(error: unknown): boolean {
  if (isQuotaExhausted(error)) return false;
  if (error instanceof HttpError) return error.status === 408 || error.status === 429 || error.status >= 500;
  if (error instanceof Error) return error.name === "TypeError" || error.name === "AbortError" || error.name === "TimeoutError";
  return false;
}

export interface CallMeta {
  stage: string;
  provider: string;
  model: string;
  shot?: string;
  lang?: string;
  aspect?: string;
  params?: Record<string, unknown>;
  seed?: number | null;
  input_hash?: string;
  output?: string;
}

export interface CallResult<T> {
  value: T;
  cost_usd?: number | null;
  details?: Record<string, unknown>;
}

export async function callModel<T>(meta: CallMeta, call: () => Promise<CallResult<T>>): Promise<T> {
  const { max_attempts, base_delay_ms, max_delay_ms } = loadConfig().retry;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const result = await call();
      logRun({
        ...meta,
        event: "model_call",
        status: "ok",
        attempt,
        latency_ms: Date.now() - started,
        cost_usd: result.cost_usd ?? null,
        details: result.details,
      });
      return result.value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logRun({ ...meta, event: "model_call", status: "error", attempt, latency_ms: Date.now() - started, error: message.slice(0, 600) });
      if (!isRetryable(error) || attempt >= max_attempts) throw error;
      const backoff = Math.min(max_delay_ms, base_delay_ms * 2 ** (attempt - 1));
      const hinted = error instanceof HttpError ? error.retryAfterMs : null;
      const wait = Math.min(max_delay_ms, hinted ?? backoff) + Math.floor(Math.random() * 500);
      console.warn(`  ! ${meta.stage}${meta.shot ? ` ${meta.shot}` : ""} attempt ${attempt} failed (${message.slice(0, 120)}); retrying in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }
  }
}
