# Experiment log

Each entry is hypothesis → change → result. One thing changes per experiment and the seed stays fixed, so the result can be attributed to the change. A result is written only after the run has happened; its evidence is the named lines in `runs.jsonl` or a listener's note in DESIGN.md.

## Done

### E01. Can the whole edit be proven before any model is called?

- **Hypothesis:** if the FFmpeg stages are driven only by files and the timeline, they can be run end to end on stand-in media, and layout or mixing bugs can be found without spending any quota.
- **Change:** pointed the stages at a throwaway folder with ten sine-tone "narration" files of 4.5 to 8.4 seconds and test-pattern "keyframes", then ran `radio`, `shots` and `assemble`.
- **Result:** confirmed. Both aspect ratios exported at 87.8 s with subtitles and the end card in place. It found two real bugs (F05 and F06 in FAILURES.md) and showed a second run to be fully cached. The mix measured −16.41 LUFS before mastering and −13.89 LUFS after, against a −14 target, with a true peak of −6.86 dB.
- **Caveat:** the loudness figures are for test tones, not speech, so they show that the mastering chain reaches its target and nothing about how the real mix sounds.
- **Decision:** keep the throwaway-folder mode (`PIPELINE_OUTPUT_DIR`, `PIPELINE_RUNS_FILE`) as a permanent part of the pipeline.

### E12. Is the word "Ethiopian" enough to fix how a character looks?

- **Hypothesis:** a character description that says "Ethiopian woman" and "Ethiopian girls" is enough for the reference sheets to show Ethiopian people, and the two daughters will look like sisters of different ages because their ages are given.
- **Change:** none at first; this was the first reference sheet run (seeds 4101 and 4102, FLUX.2 klein 4B).
- **Result:** rejected. The aunt came out with light skin and the daughters came out with light skin, green eyes and the same height, like twins. The ages in the text did not separate them.
- **Second run:** I made the descriptions explicit: warm medium-brown or brown skin, dark brown eyes, black hair, a white netela shawl, and "clearly different ages: the older about ten and a head taller, the younger about seven with a rounder face". Same seeds.
- **Result of the second run:** both sheets now match the description. Across shots s02 to s09 the aunt keeps the same mustard cardigan, white shawl, teal dress and low bun, and the sisters stay visibly different in age.
- **What it taught me:** a nationality is not a description. The model needs the visible traits spelled out, and so does any difference between two similar characters.
- **Evidence:** first sheets in `outputs/experiments/e12_reference_v1/`, current sheets in `outputs/keyframes/ref/`; the character text in `storyboard.json`.

### E13. Do the people in the background inherit the main characters' look?

- **Hypothesis:** once the main characters are fixed by reference sheets, the classroom children (who have no sheet and are described only as "schoolchildren") will match the setting.
- **Change:** none; observed across the first full keyframe run.
- **Result:** rejected. In shots s06, s07 and s08 the classroom children came out light-skinned and did not look Ethiopian, although the teacher next to them did. Shot s04 also had garbled fake lettering on the school wall despite "no text, no letters" in the style block, and in s10 the chalk came out as a large rolled tube.
- **Second change:** every crowd now carries the same explicit text ("Ethiopian schoolchildren with warm brown skin, dark brown eyes and short black hair or braids"), s04 asks for "bare walls and no signs", and s10 asks for "one short small stick of white blackboard chalk, the size of a finger". Same seeds.
- **Result of the second run:** see the regenerated keyframes; outcome recorded below once checked.
- **Evidence:** first versions in `outputs/experiments/e13_extras_v1/`.

### E11. Which of three score candidates leaves room for the voice?

- **Hypothesis:** of three ACE-Step candidates from the same caption, tempo and key, at least one sits under the voice without a competing melody, and it can be picked partly by measurement.
- **Change:** only the seed (11, 23, 47). Caption, 70 BPM, C major, 85 s, instrumental, 8 steps and shift 3.0 fixed. Run on a Kaggle T4.
- **Result:** three clearly different pieces, each about 16 to 22 GPU-seconds on a T4 (`runs.jsonl`, `remote_ingest` lines). Measured:

| Candidate | Integrated loudness | Loudness range | Mean level in the 1–4 kHz voice band | Shape in the spectrogram |
|---|---|---|---|---|
| cand_a (seed 11) | −15.2 LUFS | 7.2 LU | −27.8 dB | Dense from start to end |
| cand_b (seed 23) | −14.4 LUFS | 9.0 LU | −26.6 dB | Sparse opening, then busy |
| cand_c (seed 47) | −16.3 LUFS | 8.7 LU | −28.7 dB | Sparse opening, builds toward the end |

- **Decision:** cand_c, provisionally. It competes least with the narrator in the band where speech intelligibility lives, and its shape follows the cue sheet. The final choice is by ear, at low volume under the narration; if that overrides the measurement, it is recorded here.
- **Note:** the setup on Kaggle (installing ACE-Step and downloading about 10 GB of weights) took far longer than the three generations together. The whole notebook run, including queueing and download, took 7.8 minutes (`remote_job` line in `runs.jsonl`).

### E10. Does a real image-to-video clip beat pan-and-zoom?

- **Hypothesis:** a Wan 2.2 clip of a slow, simple movement looks better than pan-and-zoom for shots with people, but a clip with a lot of movement will break.
- **Change:** shots s03 (three people walking away), s08 (the teacher listening, children singing) and s09 (evening at the table), vertical only, Wan 2.2 TI2V-5B at 480×832, 49 frames, 20 steps, the shot's own seed. Everything else unchanged.
- **Result:** partly confirmed. s08 is a slow push-in toward her face while the children sway, and s09 is a small movement at the table; both are used in the film. s03, the one with the most movement, broke: a blue machine-like object and a white smear appear partway through. It stays as pan-and-zoom.
- **Cost:** about 400 GPU-seconds per 2-second clip on a T4, plus 333 seconds of loading, against about 20 seconds per pan-and-zoom shot on a laptop CPU.
- **Edit:** a 2-second clip is slowed by up to 2× with frame blending, held on its last frame, and pushed in slowly across the whole shot so the hold does not look frozen.
- **Not done:** the blind preference test with at least three viewers.
- **Evidence:** `outputs/clips/vertical/`, `remote_ingest` lines in `runs.jsonl`, F13 in FAILURES.md.

### E14. Can a frontier video model be compared for free?

- **Hypothesis:** Gemini Omni 1.2 Flash, which the key lists, can make one 3-second image-to-video shot on the free tier for a comparison with Wan 2.2.
- **Change:** one call for shot s03, vertical, 3 s at 360p, the smallest setting.
- **Result:** rejected. `429 ... limit: 0 requests per day on Free Tier`. A model appearing in the list does not mean the free tier can call it. No comparison was possible (F12).

### E15. Does a three-view reference sheet make the character repeat?

- **Hypothesis:** conditioning on the reference sheet keeps the aunt consistent in every shot (the practice the brief recommends).
- **Change:** none at first; observed in the first full run, then one change at a time on shots s03, s04 and s05.
- **Result:** partly rejected. When the aunt stands alone facing the viewer, the model copied the sheet itself: three of her in s04 and s05, two in s03 horizontal. Adding "only one adult woman appears" fixed s04 but made s05 vertical worse (three copies where there had been one). What worked was turning the reference sheet off for s03 and s05 only (`use_reference_sheets: false`, a per-shot switch added to the schema) and relying on the explicit text description, which already fixed her look after E12. Both shots now show one woman who still matches her cardigan, shawl and dress.
- **What it taught me:** a reference image carries its layout as well as the face. A sheet with three poses is a good consistency tool for medium shots with other people in them, and a bad one for a single standing figure.
- **Evidence:** `outputs/experiments/e15_duplicates_v1/`, `use_reference_sheets` in `storyboard.json` and the schema.

## Not run

These hypotheses were written down before the runs and were not tested in time. E05, E07 and E08 were answered by observation inside E12, E13 and E15 instead.


| # | Hypothesis | Change (everything else fixed) | How it will be judged | Result |
|---|---|---|---|---|
| E02 | A style passed as speech metadata gives warmer, slower narration than no style, without being read aloud | Shot s01 in Amharic with and without `narration.style` | Audio length in `runs.jsonl`; a native listener's preference | |
| E03 | The voice matters less than the style instruction | Shot s01 with three voices (Sulafat, Achernar, Vindemiatrix), same style | A native listener ranks them | |
| E04 | The speech model handles Amharic well but mispronounces or refuses Afaan Oromo, which is not in its language list | Shots s01 and s05 in `am`, `om` and `en` | A native speaker of each marks every wrong word | |
| E06 | FLUX.2 klein follows a long scene prompt better than FLUX.1 schnell | Shot s05 on both models, same prompt and seed | Count of requested elements present: chalkboard, map, pointer, globe, window light | |
| E09 | The brief's starting ducking settings leave the narration clear over the score | Threshold 0.02 against 0.05, same mix | A listener on a phone speaker; measured loudness in `runs.jsonl` | |
