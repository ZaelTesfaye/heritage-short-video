// The one command. `npm run film` runs every stage in order; `npm run radio` builds the audio-only prototype.
// Each stage validates the storyboard, skips work whose inputs are unchanged, and logs every call to runs.jsonl.
import { parseStageArgs, rel, runMain } from "./lib/env.ts";
import type { StageOptions } from "./lib/env.ts";
import { RUN_ID, RUNS_FILE } from "./lib/runlog.ts";
import { runAssemble } from "./assemble.ts";
import { runKaggleMusic, runKaggleVideo } from "./kaggle.ts";
import { runKeyframes } from "./keyframes.ts";
import { runMusic } from "./music.ts";
import { runNarration } from "./narration.ts";
import { runRadio } from "./radio.ts";
import { runShots } from "./shots.ts";
import { runValidate } from "./validate.ts";

type Stage = [name: string, run: (opts: StageOptions) => Promise<unknown>];

const COMMANDS: Record<string, Stage[]> = {
  film: [
    ["validate", () => runValidate()],
    ["narration", runNarration],
    ["keyframes", runKeyframes],
    // With --remote, the GPU stages run on Kaggle; without it, existing results (or the fallbacks) are used.
    ["kaggle-music", (o) => (o.remote ? runKaggleMusic(o) : Promise.resolve())],
    ["music", runMusic],
    ["kaggle-video", (o) => (o.remote ? runKaggleVideo(o) : Promise.resolve())],
    ["shots", runShots],
    ["assemble", runAssemble],
  ],
  radio: [
    ["validate", () => runValidate()],
    ["narration", runNarration],
    ["radio", runRadio],
  ],
};

async function main(): Promise<void> {
  const opts = parseStageArgs();
  const command = opts.positionals[0] ?? "film";
  const stages = COMMANDS[command];
  if (!stages) throw new Error(`Unknown command "${command}". Use: ${Object.keys(COMMANDS).join(", ")}`);

  console.log(`run ${RUN_ID}: ${command}${opts.lang ? ` --lang ${opts.lang}` : ""}${opts.only ? ` --only ${opts.only.join(",")}` : ""}${opts.force ? " --force" : ""}${opts.remote ? " --remote" : ""}`);
  const started = Date.now();
  for (const [name, run] of stages) {
    const stageStarted = Date.now();
    console.log(`\n== ${name} ==`);
    // Every per-shot stage honours --only, but assembly always rebuilds the whole film from all segments.
    await run(name === "assemble" || name === "radio" ? { ...opts, only: null } : opts);
    console.log(`   (${name} took ${((Date.now() - stageStarted) / 1000).toFixed(1)}s)`);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s. Calls logged to ${rel(RUNS_FILE)} under run_id ${RUN_ID}.`);
}

runMain(main);
