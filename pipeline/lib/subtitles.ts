// English subtitles and the end card, built from the storyboard and the timeline. All on-screen text is added here, in code.
import { SUBTITLE_LINE_CHARS } from "./storyboard.ts";
import type { Storyboard } from "./storyboard.ts";
import type { Timeline } from "./timeline.ts";
import type { AspectConfig } from "./env.ts";

export interface Cue {
  start_s: number;
  end_s: number;
  lines: string[];
}

/** Greedy word wrap to a maximum line length. */
export function wrap(text: string, maxChars = SUBTITLE_LINE_CHARS): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * At most two lines on screen at once. A subtitle too long for that is split into several cues,
 * and the narration's time is shared between them in proportion to their length.
 */
export function buildCues(sb: Storyboard, timeline: Timeline): Cue[] {
  const cues: Cue[] = [];
  for (const shot of sb.shots) {
    const timing = timeline.shots.find((t) => t.id === shot.id)!;
    const lines = wrap(shot.subtitle);
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2));

    const totalChars = groups.reduce((sum, g) => sum + g.join(" ").length, 0);
    const windowEnd = Math.min(timing.narration_start_s + timing.narration_s + 0.35, timing.start_s + timing.duration_s - 0.05);
    const window = windowEnd - timing.narration_start_s;
    let cursor = timing.narration_start_s;
    for (const group of groups) {
      const share = (group.join(" ").length / totalChars) * window;
      cues.push({ start_s: cursor, end_s: cursor + share, lines: group });
      cursor += share;
    }
  }
  return cues;
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** A separate subtitle file, so viewers and platforms can also switch captions on and off. */
export function toSrt(cues: Cue[]): string {
  return cues.map((cue, i) => `${i + 1}\n${srtTime(cue.start_s)} --> ${srtTime(cue.end_s)}\n${cue.lines.join("\n")}\n`).join("\n");
}

function assTime(seconds: number): string {
  const cs = Math.round(seconds * 100);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

const assEscape = (text: string) => text.replaceAll("{", "(").replaceAll("}", ")");

export interface AssOptions {
  width: number;
  height: number;
  subtitle: AspectConfig["subtitle"];
  /** Extra text shown for the whole programme at the top, used by the radio cut. */
  banner?: string;
}

/**
 * Burned-in subtitles plus the end card as one ASS file, rendered by FFmpeg's libass.
 * The vertical margin keeps subtitles above the buttons a phone app draws over the bottom of a 9:16 video.
 */
export function toAss(cues: Cue[], sb: Storyboard, timeline: Timeline, options: AssOptions): string {
  const { width, height, subtitle } = options;
  const cardSize = Math.round(Math.min(width, height) * 0.046);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Sub,Arial,${subtitle.font_size},&H00FFFFFF,&H000000FF,&H00141414,&H96000000,1,0,0,0,100,100,0,0,1,3,1.5,2,${subtitle.margin_h},${subtitle.margin_h},${subtitle.margin_v},1`,
    `Style: Card,Arial,${cardSize},&H00F2F6FA,&H000000FF,&H00141414,&H96000000,0,0,0,0,100,100,0,0,1,2,1,5,${subtitle.margin_h},${subtitle.margin_h},0,1`,
    `Style: Banner,Arial,${Math.round(cardSize * 0.9)},&H00BFC8D0,&H000000FF,&H00141414,&H96000000,0,0,0,0,100,100,0,0,1,2,0,8,${subtitle.margin_h},${subtitle.margin_h},${Math.round(height * 0.08)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = cues.map((cue) => `Dialogue: 0,${assTime(cue.start_s)},${assTime(cue.end_s)},Sub,,0,0,0,,${cue.lines.map(assEscape).join("\\N")}`);

  const [headline, ...rest] = sb.end_card.lines;
  const cardText = `{\\fad(500,0)}{\\b1\\fs${Math.round(cardSize * 1.9)}}${assEscape(headline)}{\\b0\\fs${cardSize}}\\N\\N${rest.map(assEscape).join("\\N")}`;
  const end = timeline.end_card;
  events.push(`Dialogue: 1,${assTime(end.start_s + 0.2)},${assTime(end.start_s + end.duration_s)},Card,,0,0,0,,${cardText}`);

  if (options.banner) {
    events.push(`Dialogue: 0,${assTime(0)},${assTime(end.start_s)},Banner,,0,0,0,,${assEscape(options.banner)}`);
  }
  return [...header, ...events, ""].join("\n");
}
