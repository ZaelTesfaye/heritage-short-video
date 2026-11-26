// Stage: moving shots. Turns each keyframe into a video segment of exactly the length the timeline asks for:
// an image-to-video clip from Kaggle when one exists for the current inputs, a slow pan-and-zoom otherwise.
import { existsSync } from "node:fs";
import { isMain, loadConfig, parseStageArgs, readJson, rel, runMain, writeJson } from "./lib/env.ts";
import type { Aspect, StageOptions } from "./lib/env.ts";
import { cached, fileHash, hashInputs } from "./lib/cache.ts";
import { ffmpeg, localRender, mediaDuration } from "./lib/ffmpeg.ts";
import { paths } from "./lib/paths.ts";
import { ingestRemoteRuns } from "./lib/remote.ts";
import { logRun } from "./lib/runlog.ts";
import { loadStoryboard, resolveLanguage, selectShots } from "./lib/storyboard.ts";
import type { KenBurns, Shot, Storyboard } from "./lib/storyboard.ts";
import { buildTimeline } from "./lib/timeline.ts";

function encodeArgs(fps: number): string[] {
  const { preset } = loadConfig().video;
  // Segments are intermediates, so they are encoded at high quality and joined without re-encoding.
  return ["-an", "-c:v", "libx264", "-preset", preset, "-crf", "14", "-pix_fmt", "yuv420p", "-r", String(fps)];
}

/** The hash a Kaggle clip must carry to be used: a clip made from an older keyframe or prompt is ignored. */
function videoJobHash(shot: Shot, keyframe: string): string {
  return hashInputs({
    model: loadConfig().models.video.model,
    keyframe: fileHash(keyframe),
    prompt: shot.motion.prompt,
    seed: shot.motion.seed ?? shot.seed,
  });
}

/** The job file the Kaggle notebook reads: one entry per image-to-video shot whose keyframe exists. */
export function writeVideoJobs(sb: Storyboard): void {
  const video = loadConfig().models.video;
  const jobs = [];
  for (const aspect of ["vertical", "horizontal"] as Aspect[]) {
    for (const shot of sb.shots) {
      const keyframe = paths.keyframe(aspect, shot.id);
      if (shot.motion.mode !== "i2v" || !existsSync(keyframe)) continue;
      jobs.push({
        shot: shot.id,
        aspect,
        keyframe: rel(keyframe),
        prompt: shot.motion.prompt,
        seed: shot.motion.seed ?? shot.seed,
        input_hash: videoJobHash(shot, keyframe),
        output: rel(paths.clip(aspect, shot.id)),
        meta: rel(paths.clipMeta(aspect, shot.id)),
      });
    }
  }
  writeJson(paths.kaggleVideoJobs(), { model: video.model, clip_seconds: video.clip_seconds, fps: sb.meta.fps, draft_resolution: video.draft_resolution, results_log: rel(paths.clipResults()), jobs });
}

function usableClip(shot: Shot, aspect: Aspect, keyframe: string): string | null {
  if (shot.motion.mode !== "i2v") return null;
  const clip = paths.clip(aspect, shot.id);
  const meta = paths.clipMeta(aspect, shot.id);
  if (!existsSync(clip) || !existsSync(meta)) return null;
  return readJson<{ input_hash?: string }>(meta).input_hash === videoJobHash(shot, keyframe) ? clip : null;
}

/** Ken Burns: a slow, linear pan and zoom across the still. Supersampled first so the motion does not jitter. */
function kenBurnsFilter(k: KenBurns, frames: number, width: number, height: number, fps: number): string {
  const scale = loadConfig().video.kenburns_supersample;
  const [w, h] = [width * scale, height * scale];
  const progress = `(on/${Math.max(1, frames - 1)})`;
  const lerp = (from: number, to: number) => `(${from}+(${to - from})*${progress})`;
  return [
    `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${w}:${h}`,
    `zoompan=z='${lerp(k.zoom_from, k.zoom_to)}':x='(iw-iw/zoom)*${lerp(k.x_from, k.x_to)}':y='(ih-ih/zoom)*${lerp(k.y_from, k.y_to)}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
}

export async function runShots(opts: StageOptions): Promise<void> {
  const sb = loadStoryboard();
  const lang = resolveLanguage(sb, opts.lang);
  const config = loadConfig();
  const fps = sb.meta.fps;
  const timeline = buildTimeline(sb, lang);

  writeVideoJobs(sb);
  const ingested = ingestRemoteRuns(paths.clipResults(), "shots");
  if (ingested) console.log(`[shots] copied ${ingested} image-to-video call(s) from the Kaggle log into runs.jsonl`);

  for (const aspect of opts.aspects) {
    const { width, height } = config.aspects[aspect];

    for (const shot of selectShots(sb, opts.only)) {
      const keyframe = paths.keyframe(aspect, shot.id);
      if (!existsSync(keyframe)) throw new Error(`Keyframe for ${shot.id} (${aspect}) is missing. Run: npm run keyframes`);
      const timing = timeline.shots.find((t) => t.id === shot.id)!;
      const clip = usableClip(shot, aspect, keyframe);
      const mode = clip ? "i2v" : "kenburns";
      const output = paths.segment(lang, aspect, shot.id);
      const inputs = {
        mode,
        keyframe: fileHash(keyframe),
        clip: clip ? fileHash(clip) : null,
        kenburns: clip ? null : shot.motion.kenburns,
        frames: timing.frames,
        fps,
        width,
        height,
        video: config.video,
      };

      const hit = await cached({ stage: "shots", shot: shot.id, lang, aspect, output, inputs, force: opts.force }, async (inputHash) => {
        if (shot.motion.mode === "i2v" && !clip) {
          logRun({ stage: "shots", event: "fallback", provider: "local", model: "ffmpeg", status: "ok", latency_ms: 0, shot: shot.id, lang, aspect, input_hash: inputHash, note: `no current ${config.models.video.model} clip for this keyframe and prompt; using Ken Burns pan-and-zoom` });
        }
        await localRender({ stage: "shots", shot: shot.id, lang, aspect, params: { mode, frames: timing.frames, width, height }, input_hash: inputHash, output: rel(output) }, async () => {
          if (clip) {
            // Draft clips are about 3 s and shots run 6-13 s. Slow the clip by up to 2x with frame blending
            // (gentle motion suits slow motion), hold its last frame for the rest, and push in slowly across
            // the whole shot so the hold never looks frozen. Then fit to the frame and trim to the exact length.
            const clipSeconds = await mediaDuration(clip);
            const slow = Math.min(2, Math.max(1, timing.duration_s / clipSeconds));
            const T = timing.duration_s.toFixed(3);
            const filter = [
              `setpts=${slow.toFixed(3)}*PTS`,
              `minterpolate=fps=${fps}:mi_mode=blend`,
              `tpad=stop_mode=clone:stop_duration=${Math.ceil(timing.duration_s)}`,
              `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos`,
              `crop=${width}:${height}`,
              `crop=w='iw/(1+0.10*min(t/${T},1))':h='ih/(1+0.10*min(t/${T},1))':x='(iw-ow)/2':y='(ih-oh)/2'`,
              `scale=${width}:${height}:flags=lanczos`,
              "setsar=1",
              "format=yuv420p",
            ].join(",");
            return ffmpeg(["-i", clip, "-vf", filter, "-frames:v", String(timing.frames), ...encodeArgs(fps), output]);
          }
          return ffmpeg(["-i", keyframe, "-vf", kenBurnsFilter(shot.motion.kenburns, timing.frames, width, height, fps), "-frames:v", String(timing.frames), ...encodeArgs(fps), output]);
        });
      });
      console.log(`[shots] ${shot.id} ${lang} ${aspect.padEnd(10)}  ${hit ? "cached  " : "rendered"}  ${mode.padEnd(8)}  ${timing.duration_s.toFixed(2)}s`);
    }

    // The end card's background: the last keyframe, blurred and darkened. Its text is added at assembly.
    if (!opts.only) {
      const last = paths.keyframe(aspect, sb.shots[sb.shots.length - 1].id);
      const output = paths.segment(lang, aspect, "end_card");
      const frames = timeline.end_card.frames;
      const inputs = { keyframe: fileHash(last), frames, fps, width, height, look: "blur40-dark-v1", video: config.video };
      const hit = await cached({ stage: "shots", shot: "end_card", lang, aspect, output, inputs, force: opts.force }, async (inputHash) => {
        await localRender({ stage: "shots", shot: "end_card", lang, aspect, params: { frames, width, height }, input_hash: inputHash, output: rel(output) }, () => {
          const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=40,eq=brightness=-0.32:saturation=0.75,setsar=1,format=yuv420p`;
          return ffmpeg(["-loop", "1", "-framerate", String(fps), "-i", last, "-vf", filter, "-frames:v", String(frames), ...encodeArgs(fps), output]);
        });
      });
      console.log(`[shots] end_card ${lang} ${aspect.padEnd(10)}  ${hit ? "cached  " : "rendered"}`);
    }
  }
}

if (isMain(import.meta.url)) runMain(() => runShots(parseStageArgs()));
