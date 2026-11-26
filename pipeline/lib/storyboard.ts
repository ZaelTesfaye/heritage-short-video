// Loads storyboard.json and refuses to continue unless it passes the JSON Schema and the cross-field checks.
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, readJson } from "./env.ts";

const require = createRequire(import.meta.url);

export interface KenBurns {
  zoom_from: number;
  zoom_to: number;
  x_from: number;
  x_to: number;
  y_from: number;
  y_to: number;
}

export interface Shot {
  id: string;
  reason: string;
  shot_size: string;
  duration_s: number;
  characters: string[];
  image_prompt: string;
  seed: number;
  motion: { mode: "kenburns" | "i2v"; prompt: string; seed?: number; kenburns: KenBurns };
  narration: Record<string, string>;
  subtitle: string;
  music_cue?: string;
}

export interface Character {
  id: string;
  description: string;
  sheet_prompt: string;
  seed: number;
}

export interface Storyboard {
  version: 1;
  title: string;
  logline?: string;
  meta: {
    audience: string;
    intent: string;
    default_language: string;
    languages: { code: string; name: string; review: string }[];
    fps: number;
    target_duration_s: { min: number; max: number };
  };
  style: { style_block: string };
  characters: Character[];
  narration: { voice: string; style: string; lead_in_s: number; tail_s: number };
  music: {
    caption: string;
    bpm: number;
    key: string;
    duration_s: number;
    candidates: { id: string; seed: number }[];
    chosen: string | null;
    chosen_reason?: string;
    cues: { shot: string; note: string }[];
  };
  end_card: { lines: string[]; duration_s: number };
  shots: Shot[];
}

export const STORYBOARD_FILE = join(ROOT, "storyboard.json");
export const SCHEMA_FILE = join(ROOT, "schema", "storyboard.schema.json");

/** Subtitle rule from the brief: at most two lines of about 40 characters on screen at once. */
export const SUBTITLE_LINE_CHARS = 40;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Checks the schema cannot express: references between parts of the file, and the 60-90 second budget. */
export function semanticChecks(sb: Storyboard): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ids = sb.shots.map((s) => s.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) errors.push(`duplicate shot ids: ${[...new Set(duplicates)].join(", ")}`);

  const languages = sb.meta.languages.map((l) => l.code);
  if (!languages.includes(sb.meta.default_language)) {
    errors.push(`meta.default_language "${sb.meta.default_language}" is not listed in meta.languages`);
  }

  const characterIds = new Set(sb.characters.map((c) => c.id));
  for (const shot of sb.shots) {
    for (const id of shot.characters) {
      if (!characterIds.has(id)) errors.push(`${shot.id}: character "${id}" is not defined in characters`);
    }
    for (const code of languages) {
      if (!shot.narration[code]?.trim()) errors.push(`${shot.id}: narration is missing for language "${code}"`);
    }
    for (const code of Object.keys(shot.narration)) {
      if (!languages.includes(code)) errors.push(`${shot.id}: narration language "${code}" is not listed in meta.languages`);
    }
    if (/\b(sign|caption|title|words?|lettering)\b.*\b(says|reading|that reads)\b/i.test(shot.image_prompt)) {
      warnings.push(`${shot.id}: image_prompt asks for readable text; image models garble text, add it in code instead`);
    }
  }

  for (const cue of sb.music.cues) {
    if (!ids.includes(cue.shot)) errors.push(`music cue refers to unknown shot "${cue.shot}"`);
  }
  if (sb.music.chosen !== null && !sb.music.candidates.some((c) => c.id === sb.music.chosen)) {
    errors.push(`music.chosen "${sb.music.chosen}" is not one of music.candidates`);
  }
  if (sb.music.chosen !== null && !sb.music.chosen_reason?.trim()) {
    warnings.push("music.chosen is set but music.chosen_reason is empty; write down why this candidate won");
  }

  const planned = sb.shots.reduce((sum, s) => sum + s.duration_s, 0) + sb.end_card.duration_s;
  const { min, max } = sb.meta.target_duration_s;
  if (planned < min || planned > max) {
    errors.push(`planned duration is ${planned.toFixed(1)}s including the end card; it must be between ${min}s and ${max}s`);
  }

  if (!sb.end_card.lines.join(" ").toLowerCase().includes("ai")) {
    errors.push("end_card.lines must say that the film was made with AI");
  }

  return { errors, warnings };
}

export function validateStoryboard(data: unknown): ValidationResult {
  const Ajv2020 = require("ajv/dist/2020");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(SCHEMA_FILE));
  if (!validate(data)) {
    const errors = (validate.errors ?? []).map((e: { instancePath: string; message?: string; params?: unknown }) => {
      return `${e.instancePath || "/"} ${e.message ?? "is invalid"} ${JSON.stringify(e.params ?? {})}`;
    });
    return { errors, warnings: [] };
  }
  return semanticChecks(data as Storyboard);
}

/** Every stage starts here, so nothing is ever generated from an invalid storyboard. */
export function loadStoryboard(): Storyboard {
  const data = readJson(STORYBOARD_FILE);
  const { errors } = validateStoryboard(data);
  if (errors.length) {
    throw new Error(`storyboard.json is invalid:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return data as Storyboard;
}

/** Resolves and checks the narration language for a run. */
export function resolveLanguage(sb: Storyboard, requested?: string): string {
  const lang = requested ?? sb.meta.default_language;
  if (!sb.meta.languages.some((l) => l.code === lang)) {
    throw new Error(`Language "${lang}" is not in the storyboard. Available: ${sb.meta.languages.map((l) => l.code).join(", ")}`);
  }
  return lang;
}

export function selectShots(sb: Storyboard, only: string[] | null): Shot[] {
  if (!only) return sb.shots;
  const unknown = only.filter((id) => !sb.shots.some((s) => s.id === id));
  if (unknown.length) throw new Error(`--only names unknown shot(s): ${unknown.join(", ")}`);
  return sb.shots.filter((s) => only.includes(s.id));
}
