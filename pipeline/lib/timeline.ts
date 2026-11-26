// The timeline: picture is cut to the voice. Each shot lasts at least its planned length and never less than its narration.
import { existsSync } from "node:fs";
import { rel, writeJson } from "./env.ts";
import { wavDuration } from "./ffmpeg.ts";
import { paths } from "./paths.ts";
import type { Storyboard } from "./storyboard.ts";

export interface TimelineShot {
  id: string;
  start_s: number;
  duration_s: number;
  frames: number;
  planned_s: number;
  narration_file: string;
  narration_start_s: number;
  narration_s: number;
}

export interface Timeline {
  lang: string;
  fps: number;
  shots: TimelineShot[];
  end_card: { start_s: number; duration_s: number; frames: number };
  total_s: number;
  total_frames: number;
}

export function buildTimeline(sb: Storyboard, lang: string): Timeline {
  const fps = sb.meta.fps;
  const { lead_in_s, tail_s } = sb.narration;
  const shots: TimelineShot[] = [];
  let frameCursor = 0;

  for (const shot of sb.shots) {
    const file = paths.narration(lang, shot.id);
    if (!existsSync(file)) {
      throw new Error(`Narration for ${shot.id} (${lang}) is missing. Run the narration stage first: npm run narration -- --lang ${lang}`);
    }
    const narration = wavDuration(file);
    // Whole frames only, so video segments and audio offsets can never drift apart.
    const frames = Math.ceil(Math.max(shot.duration_s, lead_in_s + narration + tail_s) * fps);
    const start = frameCursor / fps;
    shots.push({
      id: shot.id,
      start_s: start,
      duration_s: frames / fps,
      frames,
      planned_s: shot.duration_s,
      narration_file: rel(file),
      narration_start_s: start + lead_in_s,
      narration_s: Number(narration.toFixed(3)),
    });
    frameCursor += frames;
  }

  const endFrames = Math.ceil(sb.end_card.duration_s * fps);
  const timeline: Timeline = {
    lang,
    fps,
    shots,
    end_card: { start_s: frameCursor / fps, duration_s: endFrames / fps, frames: endFrames },
    total_s: (frameCursor + endFrames) / fps,
    total_frames: frameCursor + endFrames,
  };
  writeJson(paths.timeline(lang), timeline);
  return timeline;
}

/** Warns when the real running time has drifted outside the 60-90 second target. */
export function checkRunningTime(sb: Storyboard, timeline: Timeline): string | null {
  const { min, max } = sb.meta.target_duration_s;
  if (timeline.total_s >= min && timeline.total_s <= max) return null;
  return `Running time for "${timeline.lang}" is ${timeline.total_s.toFixed(1)}s, outside the ${min}-${max}s target. Shorten narration lines or planned durations in storyboard.json.`;
}
