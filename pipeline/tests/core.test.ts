// Unit tests for the parts of the pipeline that make no model calls: the contract, the cache key and subtitles.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson } from "../lib/env.ts";
import { hashInputs } from "../lib/cache.ts";
import { STORYBOARD_FILE, SUBTITLE_LINE_CHARS, validateStoryboard } from "../lib/storyboard.ts";
import type { Storyboard } from "../lib/storyboard.ts";
import { keyframePrompt } from "../lib/prompts.ts";
import { buildCues, toSrt, wrap } from "../lib/subtitles.ts";
import type { Timeline } from "../lib/timeline.ts";

const storyboard = () => readJson<Storyboard>(STORYBOARD_FILE);

test("the committed storyboard passes the schema and the cross-field checks", () => {
  assert.deepEqual(validateStoryboard(storyboard()).errors, []);
});

test("an unknown property is rejected by the schema", () => {
  const sb = storyboard() as any;
  sb.shots[0].colour = "red";
  assert.ok(validateStoryboard(sb).errors.length > 0);
});

test("duplicate shot ids are rejected", () => {
  const sb = storyboard();
  sb.shots[1].id = sb.shots[0].id;
  assert.match(validateStoryboard(sb).errors.join("\n"), /duplicate shot ids/);
});

test("a film outside the 60-90 second budget is rejected", () => {
  const sb = storyboard();
  for (const shot of sb.shots) shot.duration_s = 3;
  assert.match(validateStoryboard(sb).errors.join("\n"), /planned duration/);
});

test("a shot with narration missing in a listed language is rejected", () => {
  const sb = storyboard();
  delete sb.shots[2].narration.am;
  assert.match(validateStoryboard(sb).errors.join("\n"), /narration is missing for language "am"/);
});

test("an end card that does not mention AI is rejected", () => {
  const sb = storyboard();
  sb.end_card.lines = ["The end"];
  assert.match(validateStoryboard(sb).errors.join("\n"), /made with AI/);
});

test("the cache key ignores key order and changes when any input changes", () => {
  assert.equal(hashInputs({ a: 1, b: { c: 2, d: 3 } }), hashInputs({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(hashInputs({ prompt: "chalk", seed: 1 }), hashInputs({ prompt: "chalk", seed: 2 }));
});

test("changing one shot's prompt changes only that shot's keyframe prompt", () => {
  const before = storyboard();
  const after = storyboard();
  after.shots[4].image_prompt += ", seen from the back of the room";
  before.shots.forEach((shot, i) => {
    const same = keyframePrompt(before, shot, true) === keyframePrompt(after, after.shots[i], true);
    assert.equal(same, i !== 4);
  });
});

test("subtitle lines stay within the line limit", () => {
  for (const shot of storyboard().shots) {
    for (const line of wrap(shot.subtitle)) assert.ok(line.length <= SUBTITLE_LINE_CHARS, `${shot.id}: "${line}"`);
  }
});

test("subtitle cues show at most two lines, stay inside their shot and do not overlap", () => {
  const sb = storyboard();
  let cursor = 0;
  const timeline: Timeline = {
    lang: "en",
    fps: 24,
    shots: sb.shots.map((shot) => {
      const entry = { id: shot.id, start_s: cursor, duration_s: shot.duration_s, frames: shot.duration_s * 24, planned_s: shot.duration_s, narration_file: "", narration_start_s: cursor + 0.4, narration_s: shot.duration_s - 1.5 };
      cursor += shot.duration_s;
      return entry;
    }),
    end_card: { start_s: cursor, duration_s: 3.5, frames: 84 },
    total_s: cursor + 3.5,
    total_frames: (cursor + 3.5) * 24,
  };
  const cues = buildCues(sb, timeline);
  cues.forEach((cue, i) => {
    assert.ok(cue.lines.length <= 2);
    assert.ok(cue.end_s > cue.start_s);
    if (i > 0) assert.ok(cue.start_s >= cues[i - 1].end_s - 1e-9);
  });
  assert.ok(cues[cues.length - 1].end_s <= timeline.end_card.start_s);
  assert.match(toSrt(cues), /^1\n00:00:00,400 --> /);
});
