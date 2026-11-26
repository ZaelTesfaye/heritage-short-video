// The radio cut: narration over placeholder music on a black screen. A cheap prototype for the first user test,
// made before any picture exists, to check that the story lands and how long each shot needs to be.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain, loadConfig, parseStageArgs, rel, runMain } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { master, premix } from "./lib/audio.ts";
import { cached, fileHash } from "./lib/cache.ts";
import { ffmpeg, localRender } from "./lib/ffmpeg.ts";
import { paths } from "./lib/paths.ts";
import { loadStoryboard, resolveLanguage } from "./lib/storyboard.ts";
import { buildCues, toAss } from "./lib/subtitles.ts";
import { buildTimeline, checkRunningTime } from "./lib/timeline.ts";
import { ensurePlaceholder } from "./music.ts";

const WIDTH = 1280;
const HEIGHT = 720;

export async function runRadio(opts: StageOptions): Promise<string> {
  const sb = loadStoryboard();
  const lang = resolveLanguage(sb, opts.lang);
  const timeline = buildTimeline(sb, lang);
  const warning = checkRunningTime(sb, timeline);
  if (warning) console.warn(`[radio] WARNING: ${warning}`);

  const music = await ensurePlaceholder(Math.ceil(sb.music.duration_s));
  const language = sb.meta.languages.find((l) => l.code === lang)!.name;
  const ass = toAss(buildCues(sb, timeline), sb, timeline, {
    width: WIDTH,
    height: HEIGHT,
    subtitle: { font_size: 36, margin_v: 70, margin_h: 120 },
    banner: `Radio cut: ${sb.title} (${language} narration, placeholder music)`,
  });

  const output = paths.radio(lang);
  const inputs = {
    narration: timeline.shots.map((s) => ({ id: s.id, at: s.narration_start_s, hash: fileHash(paths.narration(lang, s.id)) })),
    music: fileHash(music),
    ass,
    audio: loadConfig().audio,
  };
  const hit = await cached({ stage: "radio", lang, output, inputs, force: opts.force }, async (inputHash) => {
    const loudness = await localRender(
      { stage: "radio", lang, params: { seconds: timeline.total_s, music: "placeholder" }, input_hash: inputHash, output: rel(output) },
      async () => {
        const work = paths.tmp(`radio_${lang}`);
        mkdirSync(work, { recursive: true });
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(join(work, "text.ass"), ass);
        const pre = join(work, "premix.wav");
        const mix = join(work, "mix.wav");
        await premix(timeline, music, pre);
        const measured = await master(pre, mix);
        const total = timeline.total_s.toFixed(3);
        await ffmpeg(
          [
            "-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:r=${sb.meta.fps}:d=${total}`,
            "-i", mix,
            "-vf", "ass=text.ass",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-t", total,
            "-movflags", "+faststart",
            output,
          ],
          { cwd: work },
        );
        return measured;
      },
      (measured) => ({ ...measured }),
    );
    console.log(`[radio] loudness ${loudness.output_lufs} LUFS (target ${loudness.target_lufs})`);
  });

  console.log(`[radio] ${lang}  ${hit ? "cached  " : "exported"}  ${timeline.total_s.toFixed(1)}s  ${rel(output)}`);
  for (const shot of timeline.shots) {
    console.log(`         ${shot.id}  planned ${shot.planned_s.toFixed(1)}s  narration ${shot.narration_s.toFixed(1)}s  actual ${shot.duration_s.toFixed(1)}s`);
  }
  return output;
}

if (isMain(import.meta.url)) runMain(() => runRadio(parseStageArgs()));
