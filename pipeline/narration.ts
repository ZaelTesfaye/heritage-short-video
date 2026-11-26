// Stage: narration. One TTS call and one WAV per shot and language, so a single line can be re-taken on its own.
// If the primary speech model's daily free quota is spent, the next model in `fallback_models` is tried,
// and the switch is recorded in runs.jsonl as a fallback.
import { writeFileSync } from "node:fs";
import { isMain, loadConfig, parseStageArgs, rel, runMain, sleep } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { cached } from "./lib/cache.ts";
import { wavDuration } from "./lib/ffmpeg.ts";
import { geminiTts } from "./lib/gemini.ts";
import { callModel, isQuotaExhausted } from "./lib/model.ts";
import { paths } from "./lib/paths.ts";
import { logRun } from "./lib/runlog.ts";
import { loadStoryboard, resolveLanguage, selectShots } from "./lib/storyboard.ts";

/** Models whose daily quota ran out during this process, so later shots skip straight to the next one. */
const exhausted = new Set<string>();

export async function runNarration(opts: StageOptions): Promise<void> {
  const sb = loadStoryboard();
  const lang = resolveLanguage(sb, opts.lang);
  const tts = loadConfig().models.tts;
  const models = [tts.model, ...(tts.fallback_models ?? [])];

  for (const shot of selectShots(sb, opts.only)) {
    const output = paths.narration(lang, shot.id);
    const text = shot.narration[lang];
    // The cache key names the primary model: a line made by a fallback is still the line that was asked for.
    const inputs = { model: tts.model, voice: sb.narration.voice, style: sb.narration.style, text };
    let usedModel = tts.model;

    const hit = await cached({ stage: "narration", shot: shot.id, lang, output, inputs, force: opts.force }, async (inputHash) => {
      let lastError: unknown = null;
      for (const model of models) {
        if (exhausted.has(model)) continue;
        try {
          const wav = await callModel(
            {
              stage: "narration",
              provider: tts.provider,
              model,
              shot: shot.id,
              lang,
              params: { voice: sb.narration.voice, style: sb.narration.style, text },
              seed: null,
              input_hash: inputHash,
              output: rel(output),
            },
            async () => {
              const result = await geminiTts({ model, text, voice: sb.narration.voice, style: sb.narration.style });
              return { value: result.wav, cost_usd: result.cost_usd, details: { audio_seconds: Number(result.seconds.toFixed(2)), characters: text.length, usage: result.usage } };
            },
          );
          writeFileSync(output, wav);
          usedModel = model;
          if (model !== tts.model) {
            logRun({ stage: "narration", event: "fallback", provider: tts.provider, model, status: "ok", latency_ms: 0, shot: shot.id, lang, input_hash: inputHash, note: `daily quota for ${tts.model} exhausted; line generated with ${model}` });
          }
          if (tts.min_interval_ms > 0) await sleep(tts.min_interval_ms);
          return;
        } catch (error) {
          if (!isQuotaExhausted(error)) throw error;
          exhausted.add(model);
          lastError = error;
          console.warn(`  ! ${model}: daily free quota used up; trying the next speech model`);
        }
      }
      throw lastError ?? new Error("No speech model left to try");
    });
    const via = usedModel !== tts.model ? `  via ${usedModel}` : "";
    console.log(`[narration] ${shot.id} ${lang}  ${hit ? "cached   " : "generated"}  ${wavDuration(output).toFixed(2)}s${via}`);
  }
}

if (isMain(import.meta.url)) runMain(() => runNarration(parseStageArgs()));
