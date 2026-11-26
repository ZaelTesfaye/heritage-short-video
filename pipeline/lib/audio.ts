// The sound mix: voice is the spine, music sits under it and ducks when the narrator speaks, then one loudness pass.
import { resolve } from "node:path";
import { ROOT, loadConfig } from "./env.ts";
import { ffmpeg } from "./ffmpeg.ts";
import type { Timeline } from "./timeline.ts";

export interface Loudness {
  input_lufs: number;
  input_true_peak_db: number;
  output_lufs: number;
  output_true_peak_db: number;
  target_lufs: number;
  normalization: string;
}

/**
 * Step 1, balance: place each narration line at its shot, bring voice and music to fixed loudness levels,
 * duck the music with a sidechain compressor keyed by the voice, and sum them.
 */
export async function premix(timeline: Timeline, musicFile: string, outFile: string): Promise<void> {
  const audio = loadConfig().audio;
  const total = timeline.total_s.toFixed(3);
  const args: string[] = [];
  const filters: string[] = [];

  timeline.shots.forEach((shot, i) => {
    args.push("-i", resolve(ROOT, shot.narration_file));
    const delay = Math.round(shot.narration_start_s * 1000);
    filters.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${delay}:all=1[line${i}]`);
  });

  const count = timeline.shots.length;
  const lines = timeline.shots.map((_, i) => `[line${i}]`).join("");
  filters.push(
    `${lines}amix=inputs=${count}:normalize=0:dropout_transition=0,apad=whole_dur=${total},atrim=0:${total},` +
      `loudnorm=I=${audio.voice_lufs}:TP=-1.5:LRA=11,aresample=48000,asplit=2[voice][key]`,
  );

  // The score is looped if it is shorter than the film, then trimmed and faded to the film's exact length.
  args.push("-stream_loop", "-1", "-i", musicFile);
  const fadeOutStart = Math.max(0, timeline.total_s - audio.music_fade_out_s).toFixed(3);
  filters.push(
    `[${count}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${total},` +
      `loudnorm=I=${audio.music_lufs}:TP=-2:LRA=11,aresample=48000,volume=${audio.music_gain_db}dB,` +
      `afade=t=in:st=0:d=${audio.music_fade_in_s},afade=t=out:st=${fadeOutStart}:d=${audio.music_fade_out_s}[music]`,
  );

  const duck = audio.duck;
  filters.push(`[music][key]sidechaincompress=threshold=${duck.threshold}:ratio=${duck.ratio}:attack=${duck.attack_ms}:release=${duck.release_ms}[ducked]`);
  filters.push(`[ducked][voice]amix=inputs=2:normalize=0:duration=first[out]`);

  await ffmpeg([...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", total, "-c:a", "pcm_s16le", "-ar", "48000", outFile]);
}

function parseLoudnormJson(log: string): Record<string, string> {
  const start = log.lastIndexOf("{");
  const end = log.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("loudnorm did not print its measurements");
  return JSON.parse(log.slice(start, end + 1));
}

/**
 * Step 2, master: two-pass loudness normalisation to the platform target (about -14 LUFS, true peak -1 dB).
 * Pass one measures; pass two applies a correction using those measurements. Returns what was measured.
 */
export async function master(inFile: string, outFile: string): Promise<Loudness> {
  const { master_lufs, master_true_peak_db } = loadConfig().audio;
  const target = `I=${master_lufs}:TP=${master_true_peak_db}:LRA=11`;

  const measured = parseLoudnormJson(await ffmpeg(["-i", inFile, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"]));
  const applied = parseLoudnormJson(
    await ffmpeg([
      "-i", inFile,
      "-af",
      `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:` +
        `measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json,aresample=48000`,
      "-c:a", "pcm_s16le",
      outFile,
    ]),
  );

  return {
    input_lufs: Number(measured.input_i),
    input_true_peak_db: Number(measured.input_tp),
    output_lufs: Number(applied.output_i),
    output_true_peak_db: Number(applied.output_tp),
    target_lufs: master_lufs,
    normalization: applied.normalization_type,
  };
}

/**
 * A soft synthesized chord pad, used as temp music for the radio cut and as a fallback when no score exists.
 * It is a placeholder by design: it is never presented as the film's original score.
 */
export async function synthPlaceholder(seconds: number, outFile: string): Promise<void> {
  // C major 9 without the third in the bass: C3, G3, E4, D5, each with its own slow swell.
  const voices = [
    [130.81, 0.11, 0.07, 0.0],
    [196.0, 0.09, 0.05, 1.3],
    [329.63, 0.07, 0.09, 2.1],
    [587.33, 0.03, 0.04, 0.7],
  ];
  const expr = voices
    .map(([freq, level, swell, phase]) => `${level}*sin(2*PI*${freq}*t)*(0.6+0.4*sin(2*PI*${swell}*t+${phase}))`)
    .join("+");
  await ffmpeg([
    "-f", "lavfi",
    "-i", `aevalsrc='${expr}':s=48000:d=${seconds}`,
    "-af", "lowpass=f=1800,aecho=0.8:0.6:120|240:0.3|0.2,aformat=channel_layouts=stereo",
    "-c:a", "pcm_s16le",
    outFile,
  ]);
}
