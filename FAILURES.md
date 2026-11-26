# Failure journal

What broke, what was tried, and what fixed it. Newest last. Every entry is something that actually happened; the evidence column says where to look.

## F01. The brief's API shape for speech was out of date

- **When:** 2026-11-26, before the first call.
- **What happened:** I expected Gemini text-to-speech to be a `generateContent` call with `responseModalities: ["AUDIO"]` and a `prebuiltVoiceConfig`, with the delivery style written into the prompt ("Say warmly: ..."). The current documentation describes a different API: a POST to `/v1beta/interactions` with `response_format: {"type": "audio"}`, the voice in `generation_config.speech_config`, and the style passed as a `speech_metadata` annotation. It also warns that on the 3.8 models a style written into the text may be read aloud.
- **What I did:** read the live documentation before writing the client, and built `pipeline/lib/gemini.ts` against the Interactions API. The style goes in the annotation and the narration text is sent verbatim.
- **What it taught me:** check the provider's page on the day. The old shape would have produced narration that begins by reading its own stage direction.
- **Evidence:** `pipeline/lib/gemini.ts`.

## F02. Afaan Oromo is not in the speech model's language list

- **When:** 2026-11-26, during the same documentation check.
- **What happened:** the language table for Gemini 3.8 Flash TTS lists Amharic and English. I could not find Oromo in it.
- **What I did:** kept Amharic as the main language. The Afaan Oromo narration text stays in the storyboard so the model can be tested on it directly.
- **Status:** OPEN. To be tested with a real call and a native listener; the result goes here and in EXPERIMENTS.md.

## F03. Cloudflare's FLUX.2 klein page does not document its fields

- **When:** 2026-11-26.
- **What happened:** the model page for `@cf/black-forest-labs/flux-2-klein-4b` gives the input schema only as an opaque `multipart` object. It lists no field names for the prompt, size, seed, steps or reference images, and has no REST example. The FLUX.1 schnell page does have an example, but its example sends a `seed` that its own schema does not allow.
- **What I did:** wrote the client to send multipart form fields `prompt`, `width`, `height`, `steps`, `seed` and `input_image_0…` for reference images, which is the convention used by Cloudflare's other FLUX.2 model, and to accept either a JSON or a raw image response.
- **Status:** OPEN until the first real call confirms or corrects the field names.

## F04. No FFmpeg and no `make` on the development machine

- **When:** 2026-11-26.
- **What happened:** the Windows laptop had neither `ffmpeg` nor `make` installed, and the brief's one-command example is `make film`.
- **What I did:** added `ffmpeg-static` as a dependency, which downloads an FFmpeg binary during `npm install`, and made `npm run film` the documented command, with a Makefile that wraps it for machines that have `make`. I checked that the bundled build includes the filters the pipeline needs: `zoompan`, `sidechaincompress`, `loudnorm`, `ass`, `gblur`, `tpad`.
- **What it taught me:** this is better than what I would have done on a machine with FFmpeg installed, because a stranger's clean clone now needs only Node.
- **Trade-off:** the bundled binary has no `ffprobe`, so durations are read from WAV headers and from FFmpeg's own log.

## F05. The audio mix failed when outputs lived on another drive

- **When:** 2026-11-26, in the first dry run of the FFmpeg stages on test tones.
- **What happened:** FFmpeg reported `Error opening input file D:\...\AI-gen\C:\Users\...\s01.wav`. The timeline stores narration paths relative to the repository. With the test output folder on drive C and the repository on drive D there is no relative path, so the stored path was already absolute, and joining it to the repository root produced nonsense.
- **What I did:** changed the join to a resolve, which leaves absolute paths alone.
- **What it taught me:** the bug could not appear in normal use, where outputs sit inside the repository. Running the stages against a throwaway folder is what exposed it, which is a reason to keep that test mode.
- **Evidence:** `pipeline/lib/audio.ts`, `premix()`.

## F06. Pan-and-zoom segments had slightly non-square pixels

- **When:** 2026-11-26, in the same dry run.
- **What happened:** the exported file reported a sample aspect ratio of 4096:4095 instead of 1:1, introduced by scaling before the zoom. Some players stretch such a file by a pixel or show a thin border.
- **What I did:** added `setsar=1` to every segment's filter chain.
- **Evidence:** `pipeline/shots.ts`.

## F07. The free speech quota is 10 requests a day, and it ran out on the last line

- **When:** 2026-11-26, the first real narration run.
- **What happened:** the smoke test and shots s01–s09 used 10 requests. Shot s10 got `429 Rate limit exceeded for model gemini-3.8-flash-tts (limit: 10 requests per day on Free Tier). Please retry in 15h12m55s`, which is after the deadline. The pipeline also hit the 3-requests-per-minute limit on the way. Before that, the retry policy spent about two minutes waiting on a limit that could not clear by waiting.
- **What I tried:** waiting and retrying (useless for a daily limit).
- **What fixed it:**
  1. A 429 that names a daily limit, or asks for a wait over an hour, is no longer retried (`isQuotaExhausted()` in `pipeline/lib/model.ts`).
  2. Narration now falls back through `fallback_models` in `pipeline.config.json`. Shot s10 was generated by `gemini-3.8-flash-lite-tts`, which has its own quota; the switch is logged as a `fallback` line.
  3. Calls are spaced 21 s apart (`min_interval_ms`) to stay under 3 per minute.
  4. A second API key from a separate project, which has its own quota, now replaces the first.
- **Trade-off:** shot s10 comes from a different speech model than the other nine, with the same voice name. A listener needs to check whether the voice changes noticeably at the last line. If it does, that line should be re-taken with the main model using the new key.
- **What it taught me:** at 10 lines a day, a three-language film (30 lines) is not possible on one free key in one day. The language count is limited by quota, not by code.
- **Evidence:** `runs.jsonl`, stage `narration`, status `error` with HTTP 429, followed by the `fallback` line for s10.

## F08. The Gemini text model was overloaded during the smoke test

- **When:** 2026-11-26.
- **What happened:** `gemini-3.8-flash` returned `503 ... currently experiencing high demand` on all four attempts, 99 s in total. The speech model answered normally at the same moment.
- **Status:** not a blocker for the film, since narration is written in the storyboard. The story-drafting step depends on it, so it is retried later.
- **Evidence:** `runs.jsonl`, stage `smoke`, shot `text`.
