// Stage 0: validate storyboard.json against the JSON Schema and the cross-field rules. Every other stage does this too.
import { isMain, readJson, runMain } from "./lib/env.ts";
import { STORYBOARD_FILE, validateStoryboard } from "./lib/storyboard.ts";
import type { Storyboard } from "./lib/storyboard.ts";

export async function runValidate(): Promise<void> {
  const data = readJson<Storyboard>(STORYBOARD_FILE);
  const { errors, warnings } = validateStoryboard(data);
  for (const warning of warnings) console.warn(`  warning: ${warning}`);
  if (errors.length) {
    throw new Error(`storyboard.json is invalid:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  const planned = data.shots.reduce((sum, s) => sum + s.duration_s, 0) + data.end_card.duration_s;
  console.log(`[validate] storyboard.json is valid: ${data.shots.length} shots, ${planned.toFixed(1)}s planned, languages ${data.meta.languages.map((l) => l.code).join(", ")}`);
}

if (isMain(import.meta.url)) runMain(runValidate);
