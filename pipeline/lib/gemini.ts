// Gemini API client (Interactions API over plain HTTPS). Used for narration and translation.
import { loadConfig, requireEnv } from "./env.ts";
import { pcmToWav } from "./ffmpeg.ts";
import { httpError } from "./model.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 120_000;

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "x-goog-api-key": requireEnv("GEMINI_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await httpError(response);
  return response.json();
}

/** Finds the first content part of the given type in the model's output steps. */
function findOutputPart(response: any, type: "audio" | "text"): any | null {
  const steps: any[] = Array.isArray(response?.steps) ? response.steps : [];
  for (const step of steps) {
    if (step?.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (part?.type === type) return part;
    }
  }
  return null;
}

export interface TtsResult {
  wav: Buffer;
  seconds: number;
  cost_usd: number | null;
  usage: unknown;
}

/**
 * One narration line -> one WAV (24 kHz mono 16-bit).
 * `text` is spoken verbatim; delivery is steered by `style`, sent as speech metadata and never read aloud.
 * The model detects the language from the text, so there is no language parameter.
 */
export async function geminiTts(input: { model: string; text: string; voice: string; style: string }): Promise<TtsResult> {
  const part: Record<string, unknown> = { type: "text", text: input.text };
  if (input.style) part.annotations = [{ type: "speech_metadata", style: input.style }];
  const response = await post("interactions", {
    model: input.model,
    input: [{ type: "user_input", content: [part] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: input.voice }] },
  });

  const audio = findOutputPart(response, "audio");
  if (typeof audio?.data !== "string" || !audio.data.length) {
    throw new Error(`Gemini TTS returned no audio. Response: ${JSON.stringify(response).slice(0, 500)}`);
  }
  let wav: Buffer = Buffer.from(audio.data, "base64");
  // The default is a complete WAV file; if raw PCM comes back instead, give it a header.
  if (wav.toString("ascii", 0, 4) !== "RIFF") wav = pcmToWav(wav, 24000, 1);

  const seconds = (wav.length - 44) / (24000 * 2);
  return { wav, seconds, cost_usd: ttsListPrice(input.model, input.text, seconds), usage: response?.usage ?? null };
}

/** List-price equivalent: text tokens in (about 4 characters each) plus audio tokens out (a fixed number per second). */
function ttsListPrice(model: string, text: string, seconds: number): number | null {
  const price = loadConfig().pricing[model];
  if (!price) return null;
  const inputTokens = Math.ceil(text.length / 4);
  const outputTokens = seconds * price.audio_tokens_per_second;
  return (inputTokens * price.input_usd_per_mtok + outputTokens * price.output_usd_per_mtok) / 1_000_000;
}

export interface TextResult {
  text: string;
  cost_usd: number | null;
  usage: unknown;
}

export async function geminiText(input: { model: string; prompt: string }): Promise<TextResult> {
  const response = await post("interactions", { model: input.model, input: input.prompt });
  const part = findOutputPart(response, "text");
  if (typeof part?.text !== "string") {
    throw new Error(`Gemini returned no text. Response: ${JSON.stringify(response).slice(0, 500)}`);
  }
  const price = loadConfig().pricing[input.model];
  const cost = price
    ? (Math.ceil(input.prompt.length / 4) * price.input_usd_per_mtok + Math.ceil(part.text.length / 4) * price.output_usd_per_mtok) / 1_000_000
    : null;
  return { text: part.text.trim(), cost_usd: cost, usage: response?.usage ?? null };
}
