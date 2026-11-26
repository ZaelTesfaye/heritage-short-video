// Thin wrapper around the FFmpeg binary. FFmpeg is deterministic: the same inputs give the same output.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { logRun } from "./runlog.ts";
import type { RunEntry } from "./runlog.ts";

export function ffmpegPath(): string {
  const path = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!path) throw new Error("FFmpeg binary not found. Run `npm install`, or set FFMPEG_PATH in .env.");
  return path;
}

interface RawResult {
  code: number;
  stderr: string;
}

function runRaw(args: string[], cwd?: string): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args], { cwd, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

/** Runs FFmpeg and returns its log (stderr). Throws with the last lines of the log on failure. */
export async function ffmpeg(args: string[], options: { cwd?: string } = {}): Promise<string> {
  const { code, stderr } = await runRaw(args, options.cwd);
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}:\n${stderr.trim().split("\n").slice(-12).join("\n")}`);
  }
  return stderr;
}

/** Duration in seconds of any media file, read from FFmpeg's own probe output. */
export async function mediaDuration(file: string): Promise<number> {
  const { stderr } = await runRaw(["-i", file]);
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) throw new Error(`Could not read the duration of ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Duration of a PCM WAV file from its header, without starting a process. */
export function wavDuration(file: string): number {
  const buffer = readFileSync(file);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${file} is not a WAV file`);
  }
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data") {
      if (!byteRate) break;
      // Streamed WAVs can declare a placeholder size; trust the real byte count in that case.
      const dataBytes = Math.min(size, buffer.length - offset - 8) || buffer.length - offset - 8;
      return dataBytes / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file} has no readable WAV data chunk`);
}

/** Wraps raw 16-bit little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

type RenderMeta = Pick<RunEntry, "stage" | "shot" | "lang" | "aspect" | "params" | "input_hash" | "output" | "note">;

/** Times a local FFmpeg step and records it in runs.jsonl, so COSTS.md can report latency per stage. */
export async function localRender<T>(meta: RenderMeta, render: () => Promise<T>, details?: (value: T) => Record<string, unknown>): Promise<T> {
  const started = Date.now();
  try {
    const value = await render();
    logRun({ ...meta, event: "local_render", provider: "local", model: "ffmpeg", status: "ok", latency_ms: Date.now() - started, cost_usd: null, details: details?.(value) });
    return value;
  } catch (error) {
    logRun({ ...meta, event: "local_render", provider: "local", model: "ffmpeg", status: "error", latency_ms: Date.now() - started, error: String(error instanceof Error ? error.message : error).slice(0, 600) });
    throw error;
  }
}
