// Stage: script. Reports the narration's length per language against the time budget, and can draft a
// translation of the narration into another language for a native speaker to review.
//   npm run script                      timing report
//   npm run script -- --translate ti    draft narration for language code "ti" from the English lines
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isMain, loadConfig, runMain } from "./lib/env.ts";
import { wavDuration } from "./lib/ffmpeg.ts";
import { geminiText } from "./lib/gemini.ts";
import { callModel } from "./lib/model.ts";
import { paths } from "./lib/paths.ts";
import { STORYBOARD_FILE, loadStoryboard } from "./lib/storyboard.ts";
import type { Storyboard } from "./lib/storyboard.ts";

function report(sb: Storyboard): void {
  const { lead_in_s, tail_s } = sb.narration;
  for (const { code, name } of sb.meta.languages) {
    let words = 0;
    let measured = 0;
    let measuredShots = 0;
    for (const shot of sb.shots) {
      words += shot.narration[code].trim().split(/\s+/).length;
      const file = paths.narration(code, shot.id);
      if (existsSync(file)) {
        measured += Math.max(shot.duration_s, lead_in_s + wavDuration(file) + tail_s);
        measuredShots++;
      }
    }
    const timing =
      measuredShots === sb.shots.length
        ? `measured running time ${(measured + sb.end_card.duration_s).toFixed(1)}s`
        : `narration audio exists for ${measuredShots}/${sb.shots.length} shots, so no measured running time yet`;
    console.log(`[script] ${code} (${name}): ${words} words; ${timing}`);
  }
  const planned = sb.shots.reduce((sum, s) => sum + s.duration_s, 0) + sb.end_card.duration_s;
  console.log(`[script] planned ${planned.toFixed(1)}s; target ${sb.meta.target_duration_s.min}-${sb.meta.target_duration_s.max}s`);
}

async function translate(sb: Storyboard, code: string, name: string): Promise<void> {
  const model = loadConfig().models.text.model;
  for (const shot of sb.shots) {
    if (shot.narration[code]?.trim()) continue;
    const prompt =
      `Translate this line of film narration from English into ${name}. It is spoken by a family member about their aunt, a teacher. ` +
      `Keep it short, natural and warm, written for the ear. Reply with the translation only, no quotes and no notes.\n\n${shot.narration.en}`;
    shot.narration[code] = await callModel({ stage: "script", provider: "gemini", model, shot: shot.id, lang: code, params: { task: "translate", from: "en", to: code, prompt } }, async () => {
      const result = await geminiText({ model, prompt });
      return { value: result.text, cost_usd: result.cost_usd, details: { usage: result.usage } };
    });
    console.log(`[script] ${shot.id} ${code}: ${shot.narration[code]}`);
  }
  if (!sb.meta.languages.some((l) => l.code === code)) {
    sb.meta.languages.push({ code, name, review: `Machine-translated from English by ${model} on ${new Date().toISOString().slice(0, 10)}. Not yet checked by a native speaker.` });
  }
  writeFileSync(STORYBOARD_FILE, JSON.stringify(sb, null, 2) + "\n");
  console.log(`[script] wrote ${code} narration to storyboard.json. Have a native speaker review it before generating audio.`);
}

export async function runScript(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { translate: { type: "string" }, name: { type: "string" } } });
  if (values.translate) {
    // Read the raw file here: a language that is only half translated would not pass validation yet.
    const sb = JSON.parse(readFileSync(STORYBOARD_FILE, "utf8")) as Storyboard;
    await translate(sb, values.translate, values.name ?? values.translate);
  }
  report(loadStoryboard());
}

if (isMain(import.meta.url)) runMain(() => runScript());
