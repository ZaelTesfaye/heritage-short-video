// Smoke test: call each provider once and log its latency, so a broken key or a moved model is found on day one.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, isMain, loadConfig, rel, runMain } from "./lib/env.ts";
import { cloudflareImage } from "./lib/cloudflare.ts";
import { ffmpeg, localRender } from "./lib/ffmpeg.ts";
import { geminiText, geminiTts } from "./lib/gemini.ts";
import { callModel } from "./lib/model.ts";

interface Check {
  name: string;
  model: string;
  run: () => Promise<string>;
}

export async function runSmoke(): Promise<void> {
  const { models } = loadConfig();
  const dir = join(OUT, "smoke");
  mkdirSync(dir, { recursive: true });

  const checks: Check[] = [
    {
      name: "ffmpeg (local)",
      model: "ffmpeg",
      run: async () => {
        const log = await localRender({ stage: "smoke", shot: "ffmpeg", note: "version check" }, () => ffmpeg(["-version"]));
        return log.split("\n")[0] ?? "ok";
      },
    },
    {
      name: "Gemini text",
      model: models.text.model,
      run: async () => {
        const text = await callModel({ stage: "smoke", provider: "gemini", model: models.text.model, shot: "text", params: { prompt: "Reply with the single word: ok" } }, async () => {
          const result = await geminiText({ model: models.text.model, prompt: "Reply with the single word: ok" });
          return { value: result.text, cost_usd: result.cost_usd };
        });
        return `replied "${text.slice(0, 40)}"`;
      },
    },
    {
      name: "Gemini TTS",
      model: models.tts.model,
      run: async () => {
        const file = join(dir, "tts.wav");
        const seconds = await callModel({ stage: "smoke", provider: "gemini", model: models.tts.model, shot: "tts", lang: "am", params: { voice: "Sulafat", text: "ሰላም፣ እንደምን አላችሁ?" }, output: rel(file) }, async () => {
          const result = await geminiTts({ model: models.tts.model, text: "ሰላም፣ እንደምን አላችሁ?", voice: "Sulafat", style: "warm and calm" });
          writeFileSync(file, result.wav);
          return { value: result.seconds, cost_usd: result.cost_usd, details: { audio_seconds: result.seconds } };
        });
        return `${seconds.toFixed(1)}s of audio -> ${rel(file)}`;
      },
    },
    {
      name: "Cloudflare image",
      model: models.image.model,
      run: async () => {
        const file = join(dir, "image.bin");
        const request = { model: models.image.model, prompt: "A single piece of white chalk on a wooden desk, gouache illustration, warm light", width: 512, height: 512, seed: 1, steps: models.image.steps };
        const bytes = await callModel({ stage: "smoke", provider: "cloudflare", model: models.image.model, shot: "image", seed: 1, params: request, output: rel(file) }, async () => {
          const result = await cloudflareImage(request);
          writeFileSync(file, result.image);
          return { value: result.image.length, cost_usd: result.cost_usd };
        });
        return `${bytes} bytes -> ${rel(file)}`;
      },
    },
  ];

  let failed = 0;
  for (const check of checks) {
    const started = Date.now();
    try {
      const summary = await check.run();
      console.log(`  ok    ${check.name.padEnd(18)} ${check.model.padEnd(40)} ${String(Date.now() - started).padStart(6)} ms   ${summary}`);
    } catch (error) {
      failed++;
      console.log(`  FAIL  ${check.name.padEnd(18)} ${check.model.padEnd(40)} ${String(Date.now() - started).padStart(6)} ms   ${String(error instanceof Error ? error.message : error).slice(0, 300)}`);
    }
  }
  if (failed) throw new Error(`${failed} of ${checks.length} provider checks failed. Every attempt is recorded in runs.jsonl.`);
}

if (isMain(import.meta.url)) runMain(runSmoke);
