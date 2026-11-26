# Experiment log

Each entry is hypothesis → change → result. One thing changes per experiment and the seed stays fixed, so the result can be attributed to the change. A result is written only after the run has happened; its evidence is the named lines in `runs.jsonl` or a listener's note in DESIGN.md.

## Done

### E01. Can the whole edit be proven before any model is called?

- **Hypothesis:** if the FFmpeg stages are driven only by files and the timeline, they can be run end to end on stand-in media, and layout or mixing bugs can be found without spending any quota.
- **Change:** pointed the stages at a throwaway folder with ten sine-tone "narration" files of 4.5 to 8.4 seconds and test-pattern "keyframes", then ran `radio`, `shots` and `assemble`.
- **Result:** confirmed. Both aspect ratios exported at 87.8 s with subtitles and the end card in place. It found two real bugs (F05 and F06 in FAILURES.md) and showed a second run to be fully cached. The mix measured −16.41 LUFS before mastering and −13.89 LUFS after, against a −14 target, with a true peak of −6.86 dB.
- **Caveat:** the loudness figures are for test tones, not speech, so they show that the mastering chain reaches its target and nothing about how the real mix sounds.
- **Decision:** keep the throwaway-folder mode (`PIPELINE_OUTPUT_DIR`, `PIPELINE_RUNS_FILE`) as a permanent part of the pipeline.

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
| E11 | Of three ACE-Step candidates from the same caption, at least one sits under the voice without a competing melody | Three seeds, same caption, tempo and key | Listened at low volume under the narration; the reason for the choice goes in `music.chosen_reason` | |
