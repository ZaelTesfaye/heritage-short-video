// Stage: music. Writes the ACE-Step job for Kaggle, ingests its log, and resolves which track the film uses.
import { existsSync } from "node:fs";
import { isMain, loadConfig, parseStageArgs, rel, runMain, writeJson } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { synthPlaceholder } from "./lib/audio.ts";
import { cached } from "./lib/cache.ts";
import { localRender } from "./lib/ffmpeg.ts";
import { paths } from "./lib/paths.ts";
import { ingestRemoteRuns } from "./lib/remote.ts";
import { loadStoryboard } from "./lib/storyboard.ts";
import type { Storyboard } from "./lib/storyboard.ts";

export interface Score {
  file: string;
  kind: "score" | "placeholder";
  id: string;
}

/** The job file the Kaggle notebook reads: everything ACE-Step needs, taken from the storyboard. */
function writeMusicJob(sb: Storyboard): void {
  writeJson(paths.kaggleMusicJob(), {
    model: loadConfig().models.music.model,
    caption: sb.music.caption,
    instrumental: true,
    bpm: sb.music.bpm,
    key: sb.music.key,
    duration_s: sb.music.duration_s,
    candidates: sb.music.candidates.map((c) => ({ id: c.id, seed: c.seed, output: rel(paths.musicCandidate(c.id)) })),
    cues: sb.music.cues,
    results_log: rel(paths.musicResults()),
  });
}

/** Temp music: a synthesized pad. Used for the radio cut, and for the film only while no score has been chosen. */
export async function ensurePlaceholder(seconds: number): Promise<string> {
  const output = paths.musicPlaceholder();
  const inputs = { recipe: "pad-v1", seconds };
  await cached({ stage: "music", shot: "placeholder", output, inputs }, async (inputHash) => {
    await localRender({ stage: "music", shot: "placeholder", params: inputs, input_hash: inputHash, output: rel(output), note: "synthesized placeholder pad, not a model output" }, () =>
      synthPlaceholder(seconds, output),
    );
  });
  return output;
}

export async function runMusic(_opts: StageOptions): Promise<Score> {
  const sb = loadStoryboard();
  writeMusicJob(sb);
  const ingested = ingestRemoteRuns(paths.musicResults(), "music");
  if (ingested) console.log(`[music] copied ${ingested} ACE-Step call(s) from the Kaggle log into runs.jsonl`);

  const chosen = sb.music.chosen;
  if (chosen && existsSync(paths.musicCandidate(chosen))) {
    console.log(`[music] score: ${chosen} (${rel(paths.musicCandidate(chosen))})`);
    return { file: paths.musicCandidate(chosen), kind: "score", id: chosen };
  }

  const found = sb.music.candidates.filter((c) => existsSync(paths.musicCandidate(c.id))).map((c) => c.id);
  if (chosen) {
    console.warn(`[music] music.chosen is "${chosen}" but ${rel(paths.musicCandidate(chosen))} does not exist; using the placeholder`);
  } else if (found.length) {
    console.warn(`[music] candidates present (${found.join(", ")}) but none chosen; set music.chosen in storyboard.json. Using the placeholder`);
  } else {
    console.warn(`[music] no ACE-Step candidates yet; run kaggle/ace_step_music.ipynb with ${rel(paths.kaggleMusicJob())}. Using the placeholder`);
  }
  const file = await ensurePlaceholder(Math.ceil(sb.music.duration_s));
  return { file, kind: "placeholder", id: "placeholder" };
}

if (isMain(import.meta.url)) runMain(() => runMusic(parseStageArgs()));
