// Stage: keyframes. Reference sheets first, then one still per shot and aspect ratio, conditioned on those sheets.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isMain, loadConfig, parseStageArgs, rel, runMain } from "./lib/env.ts";
import type { Aspect, StageOptions } from "./lib/env.ts";
import { cached, fileHash } from "./lib/cache.ts";
import { cloudflareImage, supportsReferences } from "./lib/cloudflare.ts";
import { ffmpeg } from "./lib/ffmpeg.ts";
import { callModel } from "./lib/model.ts";
import { paths } from "./lib/paths.ts";
import { charactersIn, keyframePrompt, sheetPrompt } from "./lib/prompts.ts";
import { loadStoryboard, selectShots } from "./lib/storyboard.ts";

const SHEET_SIZE = 1024;

interface ImageJob {
  label: string;
  shot: string;
  aspect?: Aspect;
  output: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  references: { name: string; file: string }[];
  force: boolean;
}

async function generate(job: ImageJob): Promise<boolean> {
  const image = loadConfig().models.image;
  const inputs = {
    model: image.model,
    steps: image.steps,
    prompt: job.prompt,
    seed: job.seed,
    width: job.width,
    height: job.height,
    // The sheets' bytes are inputs: a regenerated sheet invalidates every keyframe that used it.
    references: job.references.map((r) => ({ name: r.name, hash: fileHash(r.file) })),
  };

  return cached({ stage: "keyframes", shot: job.shot, aspect: job.aspect, output: job.output, inputs, force: job.force }, async (inputHash) => {
    const bytes = await callModel(
      {
        stage: "keyframes",
        provider: image.provider,
        model: image.model,
        shot: job.shot,
        aspect: job.aspect,
        seed: job.seed,
        params: { steps: image.steps, width: job.width, height: job.height, prompt: job.prompt, references: job.references.map((r) => r.name) },
        input_hash: inputHash,
        output: rel(job.output),
      },
      async () => {
        const result = await cloudflareImage({
          model: image.model,
          prompt: job.prompt,
          width: job.width,
          height: job.height,
          seed: job.seed,
          steps: image.steps,
          references: job.references.map((r) => ({ name: r.name, png: readFileSync(r.file) })),
        });
        return { value: result.image, cost_usd: result.cost_usd, details: { bytes: result.image.length, references_used: result.references_used } };
      },
    );
    // Whatever format and size the provider returned, store an exact-size PNG so later stages can rely on it.
    const raw = paths.tmp(`keyframe_${inputHash}.bin`);
    mkdirSync(dirname(raw), { recursive: true });
    writeFileSync(raw, bytes);
    await ffmpeg(["-i", raw, "-vf", `scale=${job.width}:${job.height}:force_original_aspect_ratio=increase,crop=${job.width}:${job.height}`, "-frames:v", "1", job.output]);
    rmSync(raw, { force: true });
  });
}

export async function runKeyframes(opts: StageOptions): Promise<void> {
  const sb = loadStoryboard();
  const config = loadConfig();
  const useReferences = supportsReferences(config.models.image.model);

  // 1. Lock the look: one reference sheet per character, before any shot is generated.
  for (const character of sb.characters) {
    const hit = await generate({
      label: `ref:${character.id}`,
      shot: `ref:${character.id}`,
      output: paths.reference(character.id),
      prompt: sheetPrompt(sb, character),
      seed: character.seed,
      width: SHEET_SIZE,
      height: SHEET_SIZE,
      references: [],
      // --only regenerates the named shots, never the sheets they depend on.
      force: opts.force && !opts.only,
    });
    console.log(`[keyframes] ref:${character.id}  ${hit ? "cached" : "generated"}`);
  }

  // 2. One keyframe per shot and aspect, with the same seed and prompt in both aspects.
  for (const aspect of opts.aspects) {
    const size = config.aspects[aspect].keyframe;
    for (const shot of selectShots(sb, opts.only)) {
      const references = useReferences
        ? charactersIn(sb, shot).map((c) => ({ name: c.id, file: paths.reference(c.id) }))
        : [];
      const missing = references.find((r) => !existsSync(r.file));
      if (missing) throw new Error(`Reference sheet for "${missing.name}" is missing; cannot generate ${shot.id}`);

      const hit = await generate({
        label: shot.id,
        shot: shot.id,
        aspect,
        output: paths.keyframe(aspect, shot.id),
        prompt: keyframePrompt(sb, shot, references.length > 0),
        seed: shot.seed,
        width: size.width,
        height: size.height,
        references,
        force: opts.force,
      });
      console.log(`[keyframes] ${shot.id} ${aspect.padEnd(10)}  ${hit ? "cached" : "generated"}  refs=${references.length}`);
    }
  }
}

if (isMain(import.meta.url)) runMain(() => runKeyframes(parseStageArgs()));
