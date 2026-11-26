// Stage: assembly. Joins the segments, mixes voice and score, burns in subtitles and the end card, exports each aspect.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain, loadConfig, parseStageArgs, rel, runMain } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { master, premix } from "./lib/audio.ts";
import { cached, fileHash } from "./lib/cache.ts";
import { ffmpeg, localRender } from "./lib/ffmpeg.ts";
import { paths } from "./lib/paths.ts";
import { logRun } from "./lib/runlog.ts";
import { loadStoryboard, resolveLanguage } from "./lib/storyboard.ts";
import { buildCues, toAss, toSrt } from "./lib/subtitles.ts";
import { buildTimeline, checkRunningTime } from "./lib/timeline.ts";
import { runMusic } from "./music.ts";

export async function runAssemble(opts: StageOptions): Promise<string[]> {
  const sb = loadStoryboard();
  const lang = resolveLanguage(sb, opts.lang);
  const config = loadConfig();
  const timeline = buildTimeline(sb, lang);
  const warning = checkRunningTime(sb, timeline);
  if (warning) console.warn(`[assemble] WARNING: ${warning}`);

  // 1. Sound: voice on the timeline, score ducked under it, then one loudness pass. Shared by both aspects.
  const score = await runMusic(opts);
  const mix = paths.mix(lang);
  const mixInputs = {
    narration: timeline.shots.map((s) => ({ id: s.id, at: s.narration_start_s, hash: fileHash(paths.narration(lang, s.id)) })),
    music: fileHash(score.file),
    total_s: timeline.total_s,
    audio: config.audio,
  };
  const mixHit = await cached({ stage: "assemble", shot: "mix", lang, output: mix, inputs: mixInputs, force: opts.force }, async (inputHash) => {
    if (score.kind === "placeholder") {
      logRun({ stage: "assemble", event: "fallback", provider: "local", model: "ffmpeg", status: "ok", latency_ms: 0, shot: "mix", lang, input_hash: inputHash, note: "no chosen ACE-Step score; mixed with the synthesized placeholder pad" });
    }
    const loudness = await localRender(
      { stage: "assemble", shot: "mix", lang, params: { music: score.id, duck: config.audio.duck, target_lufs: config.audio.master_lufs }, input_hash: inputHash, output: rel(mix) },
      async () => {
        const pre = paths.tmp(`premix_${lang}.wav`);
        mkdirSync(dirname(pre), { recursive: true });
        await premix(timeline, score.file, pre);
        return master(pre, mix);
      },
      (measured) => ({ ...measured }),
    );
    console.log(`[assemble] mix ${lang}: ${loudness.input_lufs} LUFS before, ${loudness.output_lufs} LUFS after (target ${loudness.target_lufs}), true peak ${loudness.output_true_peak_db} dB`);
  });
  if (mixHit) console.log(`[assemble] mix ${lang}  cached`);

  // 2. Subtitles: an SRT file beside the film, and the same cues burned into the picture.
  const cues = buildCues(sb, timeline);
  mkdirSync(dirname(paths.subtitles(lang)), { recursive: true });
  writeFileSync(paths.subtitles(lang), toSrt(cues));

  // 3. Picture: join, burn in text, mux, export.
  const outputs: string[] = [];
  for (const aspect of opts.aspects) {
    const { width, height, subtitle } = config.aspects[aspect];
    const segments = [...sb.shots.map((s) => paths.segment(lang, aspect, s.id)), paths.segment(lang, aspect, "end_card")];
    const missing = segments.filter((s) => !existsSync(s));
    if (missing.length) throw new Error(`Missing segment(s): ${missing.map(rel).join(", ")}. Run: npm run shots -- --lang ${lang}`);

    const ass = toAss(cues, sb, timeline, { width, height, subtitle });
    const output = paths.film(lang, aspect);
    const comment = `Made with AI. Images: ${config.models.image.model}. Narration voice: ${config.models.tts.model}. Music: ${score.kind === "score" ? config.models.music.model : "synthesized placeholder"}. Assembled from storyboard.json with FFmpeg.`;
    const inputs = { segments: segments.map(fileHash), mix: fileHash(mix), ass, comment, title: sb.title, crf: config.video.crf, preset: config.video.preset };

    const hit = await cached({ stage: "assemble", shot: "film", lang, aspect, output, inputs, force: opts.force }, async (inputHash) => {
      await localRender({ stage: "assemble", shot: "film", lang, aspect, params: { width, height, seconds: timeline.total_s, segments: segments.length }, input_hash: inputHash, output: rel(output) }, async () => {
        const work = paths.tmp(`assemble_${lang}_${aspect}`);
        mkdirSync(work, { recursive: true });
        writeFileSync(join(work, "segments.txt"), segments.map((s) => `file '${s.replaceAll("\\", "/")}'`).join("\n") + "\n");
        writeFileSync(join(work, "text.ass"), ass);

        const silent = join(work, "silent.mp4");
        await ffmpeg(["-f", "concat", "-safe", "0", "-i", join(work, "segments.txt"), "-c", "copy", silent]);

        // FFmpeg runs inside the work folder so the subtitle filter gets a plain relative filename.
        const fadeOut = (timeline.total_s - 0.4).toFixed(3);
        await ffmpeg(
          [
            "-i", silent,
            "-i", mix,
            "-vf", `ass=text.ass,fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut}:d=0.4`,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-preset", config.video.preset, "-crf", String(config.video.crf), "-pix_fmt", "yuv420p", "-r", String(sb.meta.fps),
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-t", timeline.total_s.toFixed(3),
            "-movflags", "+faststart",
            "-metadata", `title=${sb.title}`,
            "-metadata", `comment=${comment}`,
            output,
          ],
          { cwd: work },
        );
      });
    });
    console.log(`[assemble] ${lang} ${aspect.padEnd(10)}  ${hit ? "cached  " : "exported"}  ${width}x${height}  ${timeline.total_s.toFixed(1)}s  ${rel(output)}`);
    outputs.push(output);
  }
  return outputs;
}

if (isMain(import.meta.url)) runMain(() => runAssemble(parseStageArgs()));
