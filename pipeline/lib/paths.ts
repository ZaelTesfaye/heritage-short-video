// Where every stage writes its outputs. One place, so stages agree without importing each other.
import { join } from "node:path";
import { OUT } from "./env.ts";
import type { Aspect } from "./env.ts";

export const paths = {
  narration: (lang: string, shot: string) => join(OUT, "narration", lang, `${shot}.wav`),
  reference: (character: string) => join(OUT, "keyframes", "ref", `${character}.png`),
  keyframe: (aspect: Aspect, shot: string) => join(OUT, "keyframes", aspect, `${shot}.png`),
  /** Image-to-video clips made on Kaggle and copied back in. */
  clip: (aspect: Aspect, shot: string) => join(OUT, "clips", aspect, `${shot}.mp4`),
  clipMeta: (aspect: Aspect, shot: string) => join(OUT, "clips", aspect, `${shot}.json`),
  clipResults: () => join(OUT, "clips", "results.jsonl"),
  segment: (lang: string, aspect: Aspect, name: string) => join(OUT, "segments", lang, aspect, `${name}.mp4`),
  musicCandidate: (id: string) => join(OUT, "music", "candidates", `${id}.wav`),
  musicResults: () => join(OUT, "music", "candidates", "results.jsonl"),
  musicPlaceholder: () => join(OUT, "music", "placeholder.wav"),
  kaggleVideoJobs: () => join(OUT, "kaggle", "wan_jobs.json"),
  kaggleMusicJob: () => join(OUT, "kaggle", "music_job.json"),
  timeline: (lang: string) => join(OUT, "timeline", `${lang}.json`),
  mix: (lang: string) => join(OUT, "film", lang, "mix.wav"),
  film: (lang: string, aspect: Aspect) => join(OUT, "film", lang, `heritage_${lang}_${aspect}.mp4`),
  subtitles: (lang: string) => join(OUT, "film", lang, `heritage_${lang}.en.srt`),
  radio: (lang: string) => join(OUT, "radio", `radio_cut_${lang}.mp4`),
  tmp: (...parts: string[]) => join(OUT, "tmp", ...parts),
};
