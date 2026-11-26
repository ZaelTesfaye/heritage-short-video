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

## Planned

Hypotheses are written down before the runs. Results are empty until the runs happen.

| # | Hypothesis | Change (everything else fixed) | How it will be judged | Result |
|---|---|---|---|---|
| E02 | A style passed as speech metadata gives warmer, slower narration than no style, without being read aloud | Shot s01 in Amharic with and without `narration.style` | Audio length in `runs.jsonl`; a native listener's preference | |
| E03 | The voice matters less than the style instruction | Shot s01 with three voices (Sulafat, Achernar, Vindemiatrix), same style | A native listener ranks them | |
| E04 | The speech model handles Amharic well but mispronounces or refuses Afaan Oromo, which is not in its language list | Shots s01 and s05 in `am`, `om` and `en` | A native speaker of each marks every wrong word | |
| E05 | Conditioning keyframes on a reference sheet keeps the aunt recognisably the same; the same prompts without the sheet drift | Shots s02, s05, s08 with and without the reference image, same seeds | Side by side: face, hair, shawl, cardigan and dress matched per shot | |
| E06 | FLUX.2 klein follows a long scene prompt better than FLUX.1 schnell | Shot s05 on both models, same prompt and seed | Count of requested elements present: chalkboard, map, pointer, globe, window light | |
| E07 | Keeping "no text" in the style block stops garbled writing on the chalkboard | Shot s05 with and without the last clause of the style block | Whether lettering appears on the board | |
| E08 | The same prompt and seed at 9:16 and 16:9 give a composition that works in both, so one storyboard serves both exports | All shots in both aspects | Count of shots where the subject is cut off or off-centre | |
| E09 | The brief's starting ducking settings leave the narration clear over the score | Threshold 0.02 against 0.05, same mix | A listener on a phone speaker; measured loudness in `runs.jsonl` | |
| E10 | An image-to-video clip of a slow, simple movement beats pan-and-zoom for shots with people, but not for the establishing shot | Shots s01 and s06 as Wan 2.2 clips and as pan-and-zoom | Blind preference of at least three viewers; GPU minutes per clip | |
