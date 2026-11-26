# Architecture

## The idea

One file is the contract. [storyboard.json](storyboard.json) holds everything that decides what the film is: shots, planned durations, image prompts, seeds, motion, narration in each language, subtitles, the music brief and the end card. Stages never talk to each other directly. Each one reads the storyboard, reads the files of the stage before it, and writes its own files under `outputs/`.

Everything that is a creative decision lives in the storyboard. Everything that is a technical setting (model ids, output sizes, retry limits, loudness targets, list prices) lives in [pipeline.config.json](pipeline.config.json). Secrets live only in `.env`.

```
                 schema/storyboard.schema.json
                              │ validates
                              ▼
                       storyboard.json
                              │
   ┌────────────┬─────────────┼──────────────┬────────────────┐
   ▼            ▼             ▼              ▼                ▼
narration    keyframes      music          shots           assemble
(Gemini TTS) (FLUX.2 on     (ACE-Step on   (Wan 2.2 on     (FFmpeg)
             Cloudflare)    Kaggle)        Kaggle, or
                                           FFmpeg zoompan)
   │            │             │              │                │
   ▼            ▼             ▼              ▼                ▼
narration/   keyframes/     music/         segments/        film/<lang>/
<lang>/      ref/, vertical/ candidates/   <lang>/<aspect>/  *.mp4, *.srt
sNN.wav      horizontal/                   sNN.mp4
                              │
                              ▼
                 runs.jsonl  +  outputs/cache.json
```

## Stages and their contracts

| Stage | Reads | Writes | Model call |
|---|---|---|---|
| `validate` | `storyboard.json`, the schema | nothing | none |
| `narration` | each shot's `narration[lang]`, `narration.voice`, `narration.style` | `outputs/narration/<lang>/sNN.wav` | one TTS call per shot |
| `keyframes` | `characters`, `style.style_block`, each shot's `image_prompt`, `seed`, `characters` | `outputs/keyframes/ref/<character>.png`, then `outputs/keyframes/<aspect>/sNN.png` | one image call per sheet and per shot per aspect |
| `music` | `music` | `outputs/kaggle/music_job.json`; resolves the chosen candidate or the placeholder | ACE-Step on Kaggle |
| `shots` | keyframes, narration durations, each shot's `motion` | `outputs/kaggle/wan_jobs.json`, `outputs/segments/<lang>/<aspect>/sNN.mp4` | Wan 2.2 on Kaggle, optional |
| `assemble` | segments, narration, the score, `subtitle`, `end_card` | `outputs/film/<lang>/` | none |

Supporting pieces in [pipeline/lib/](pipeline/lib/):

| File | Responsibility |
|---|---|
| `storyboard.ts` | Load and validate the contract |
| `cache.ts` | Decide whether a step must run |
| `model.ts` | Retry policy and one log line per attempt for hosted model calls |
| `runlog.ts` | Append to `runs.jsonl` |
| `timeline.ts` | Turn narration durations into shot timings |
| `gemini.ts`, `cloudflare.ts` | The two HTTP clients |
| `remote.ts` | Copy the Kaggle notebooks' call logs into `runs.jsonl` |
| `audio.ts`, `subtitles.ts`, `ffmpeg.ts` | Mixing, text, and the FFmpeg wrapper |

## Validation

Every stage begins with `loadStoryboard()`, which refuses to continue unless the file passes two checks:

1. **The JSON Schema** ([schema/storyboard.schema.json](schema/storyboard.schema.json), draft 2020-12, checked with Ajv in strict mode). Unknown properties are rejected everywhere, so a typo in a field name fails loudly instead of being ignored.
2. **Cross-field rules** the schema cannot express: shot ids are unique; every character a shot names is defined; every shot has narration in every listed language; music cues point at real shots; the chosen music candidate exists in the candidate list; the planned running time including the end card is within 60–90 seconds; the end card mentions AI.

## Picture is cut to the voice

A shot's planned `duration_s` is a minimum. The real length is

```
max(planned duration, lead-in + narration audio length + tail)
```

rounded up to a whole frame. `timeline.ts` computes this from the actual narration WAVs and writes `outputs/timeline/<lang>.json`. Because the narration in each language has a different length, segments are rendered per language, while keyframes are shared by all languages.

## Caching

Each step declares its output file and its inputs: everything that determines the output. `cache.ts` hashes the inputs (SHA-256 over JSON with sorted keys) and stores the hash against the output path in `outputs/cache.json`. A step is skipped only when the output file exists and the stored hash equals the current one.

Upstream files are inputs by content, not by name, so changes travel downstream on their own:

| Step | Inputs hashed |
|---|---|
| Narration line | model, voice, style, text |
| Reference sheet | model, steps, full prompt, seed, size |
| Keyframe | model, steps, full prompt, seed, size, the bytes of each reference sheet used |
| Segment | motion mode, the keyframe's bytes, the clip's bytes if any, pan-and-zoom parameters, frame count, size |
| Mix | each narration file's bytes and start time, the score's bytes, the audio settings |
| Final export | every segment's bytes, the mix's bytes, the subtitle text, encoder settings |

So changing shot 5's image prompt regenerates two keyframes (one per aspect), two segments and the two exports, and nothing else. Changing shot 5's narration line regenerates one WAV, the segments whose timing moved, the mix and the exports. Regenerating a character sheet invalidates every keyframe that character appears in.

Every skipped step writes a `cache_hit` line to `runs.jsonl`, so a rerun shows exactly what was reused. `--force` bypasses the cache; with `--only`, it applies to the named shots and never to the reference sheets they depend on.

`outputs/segments/` is not committed. Segments are deterministic FFmpeg renders, so a fresh clone rebuilds them locally without any model call.

## Failure handling

**Hosted model calls** all go through `callModel()` in `model.ts`:

- Each attempt writes one line to `runs.jsonl`, whether it succeeded or failed.
- Rate limits (429), timeouts (408), server errors (5xx) and dropped connections are retried, up to `retry.max_attempts` (4), with exponential backoff and jitter. When the provider says how long to wait (`Retry-After`, or Gemini's `retryDelay`), that wait is used instead.
- Bad requests (other 4xx) are not retried, because repeating them cannot help.
- Requests have a timeout, so a hung connection becomes a retryable error.

**Fallbacks**, each recorded as a `fallback` line:

| If this is missing | The pipeline uses |
|---|---|
| A Wan 2.2 clip for a shot marked `i2v` | A slow pan-and-zoom over the keyframe |
| A clip made from an older keyframe or prompt | The same fallback: a clip is used only if the hash it carries matches the current keyframe, prompt and seed |
| A chosen ACE-Step score | A synthesized placeholder pad, named as a placeholder in the file's metadata |

**Partial runs.** Outputs are written and recorded one at a time, so a run that dies at shot 7 resumes at shot 7.

**The Kaggle hand-off.** GPU stages cannot run locally, so they are decoupled by files. The pipeline writes a job file; a notebook runs the jobs, saves each result as it finishes, and appends one line per model call to its own results log; the next local run copies those lines into `runs.jsonl` once, marked `remote_ingest`.

## The sound mix

1. Each narration WAV is placed at its shot's start plus the lead-in.
2. Voice and music are each brought to a fixed loudness first, so the balance between them is a setting and not an accident of how loud each model's output happened to be.
3. The music is ducked by a sidechain compressor keyed by the voice.
4. The sum goes through two-pass loudness normalisation to −14 LUFS with a −1 dB true-peak ceiling. The measured loudness before and after is written to `runs.jsonl`.

## On-screen text

No text is ever requested from an image model. Subtitles and the end card are generated in `subtitles.ts` as one ASS file and burned in at assembly. Subtitles are at most two lines of 40 characters, and the vertical export keeps them above the area a phone app covers with its own buttons.

## Tests

`npm test` covers what can be tested without a model: the committed storyboard validates, broken storyboards are rejected for the right reason, the cache key is stable, a prompt change touches only its own shot, and subtitle cues obey the line and timing rules. Setting `PIPELINE_OUTPUT_DIR` and `PIPELINE_RUNS_FILE` points the stages at a throwaway folder, which is how the FFmpeg stages were dry-run on test tones before any real media existed.
