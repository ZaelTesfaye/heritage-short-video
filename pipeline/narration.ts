// Stage: narration. One TTS call and one WAV per shot and language, so a single line can be re-taken on its own.
import { writeFileSync } from "node:fs";
import { isMain, loadConfig, parseStageArgs, rel, runMain, sleep } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { cached } from "./lib/cache.ts";
import { wavDuration } from "./lib/ffmpeg.ts";
import { geminiTts } from "./lib/gemini.ts";
import { callModel } from "./lib/model.ts";
import { paths } from "./lib/paths.ts";
import { loadStoryboard, resolveLanguage, selectShots } from "./lib/storyboard.ts";

export async function runNarration(opts: StageOptions): Promise<void> {
  const sb = loadStoryboard();
  const lang = resolveLanguage(sb, opts.lang);
  const tts = loadConfig().models.tts;

  for (const shot of selectShots(sb, opts.only)) {
    const output = paths.narration(lang, shot.id);
    const text = shot.narration[lang];
    const inputs = { model: tts.model, voice: sb.narration.voice, style: sb.narration.style, text };

    const hit = await cached({ stage: "narration", shot: shot.id, lang, output, inputs, force: opts.force }, async (inputHash) => {
      const wav = await callModel(
        {
          stage: "narration",
          provider: tts.provider,
          model: tts.model,
          shot: shot.id,
          lang,
          params: { voice: sb.narration.voice, style: sb.narration.style, text },
          seed: null,
          input_hash: inputHash,
          output: rel(output),
        },
        async () => {
          const result = await geminiTts({ model: tts.model, text, voice: sb.narration.voice, style: sb.narration.style });
          return { value: result.wav, cost_usd: result.cost_usd, details: { audio_seconds: Number(result.seconds.toFixed(2)), characters: text.length, usage: result.usage } };
        },
      );
      writeFileSync(output, wav);
      if (tts.min_interval_ms > 0) await sleep(tts.min_interval_ms);
    });
    console.log(`[narration] ${shot.id} ${lang}  ${hit ? "cached   " : "generated"}  ${wavDuration(output).toFixed(2)}s`);
  }
}

if (isMain(import.meta.url)) runMain(() => runNarration(parseStageArgs()));
