# Report: The Teacher Who Listened

> **Draft.** Sections marked **[AUTHOR]** need your own words or your listeners' real reactions. Everything else is drawn from the repository, and each claim names where its evidence is.

## What I set out to make, and for whom

A 60–90 second film about my aunt, who raised two daughters and taught social studies in a school in Addis Ababa. All the children loved her, and what she loved most was to hear her students sing.

The film is for her daughters and our wider family, watched on a phone. At the end they should feel proud of her and recognise the quiet kindness she gave both her daughters and her students. **[AUTHOR: confirm or correct this.]**

It is narrated in Amharic with English subtitles, in ten shots plus an end card. The narration runs 84.8 seconds in the radio cut.

The film is the output of a pipeline. One file, `storyboard.json`, holds every creative decision, and `npm run film` turns it into keyframes, moving shots, narration, a score and two exports.

## What I learned from my audience

**[AUTHOR]** Fill this from DESIGN.md once the tests have happened:

- **Radio cut (first test):** who listened (relation, not name), what they said, which line stayed with them, and what I changed in `storyboard.json` because of it.
- **Near-final cut (second test):** the same.

The change should be visible in the git history of `storyboard.json`.

## The hardest problem and how I solved it

The hardest problem was that every free tier ran out or misbehaved in a different way, and the pipeline had to keep going through all of them. The evidence is in FAILURES.md.

- **Speech:** the free speech model allows 10 requests a day. It ran out on the tenth narration line, and Google's own retry hint was 15 hours, after the deadline (F07). The retry policy first wasted two minutes waiting on a limit that cannot clear by waiting. I changed it so a daily-limit 429 is never retried, and added a fallback list of speech models. Line 10 was made by `gemini-3.8-flash-lite-tts`, and the switch is logged.
- **Pictures:** Cloudflare's safety filter refused three harmless pictures, including one with no person in it (F09). The same prompt passed in the other aspect ratio, which showed the filter reacts to particular random outputs, not to the prompt. The stage now finishes the other shots, and retries a refused output with the next seed in a fixed sequence, so the result stays reproducible.
- **Video:** Wan 2.2 on a free Kaggle T4 ran out of GPU memory on the first try and was killed on the second (F13). Loading the text encoder and the video model in separate stages made the third try work; two of the three clips are in the film, and the third broke and was left out (E10).
- **Music:** the Kaggle music job finished, but over a connection of about 35 KB/s the 16 MB WAVs kept stopping mid-download (F10). The notebook now ships MP3s, and the runner retries partial downloads.

The general lesson: the call to the model is the easy part. The work is in deciding which failures are worth retrying, which need a different model, and which need a different seed, and logging each decision so it can be explained later.

## A suggested practice that beat my instinct

**A reference sheet before keyframes, with the character description attached word for word to every prompt.** My instinct was that saying "an Ethiopian teacher" would be enough. It was not (E12). The first sheets showed light skin and green-eyed twins. With the traits spelled out and the sheet attached as a reference image, the aunt keeps the same cardigan, shawl, dress and hair across eight shots, and the two daughters stay visibly different in age.

The same practice also showed its limit (E13). Background children who had no sheet drifted to a different ethnicity, even standing next to the teacher who did. Every crowd now carries the same explicit description too.

## A suggested practice that did not work as expected

**"No text" in the style block.** The brief suggests adding words in code rather than asking the model for them, and keeping the style block on every prompt. Both are good practice, but the "no text, no letters, no writing" clause alone did not stop the model painting a fake sign ("AEHM") on the school wall in shot 4 (E13). What worked was describing the surface instead: "bare walls and no signs". **[AUTHOR: replace with a better example from your own experience if you have one.]**

## Curiosity beyond the floor

- **A tool for others.** `npm run script -- --from story.txt` drafts a whole storyboard from a few sentences. The text model proposes only the creative parts; code fills in ids, seeds and camera moves, validates the result, and sends validator errors back to the model for repair. `npm run ui` puts the same pipeline behind a local web page, so a relative who does not code can tell a story, review each shot and make the film.
- **GPU stages from one command.** `npm run film -- --remote` uploads the music and image-to-video jobs to Kaggle, waits, downloads the results and logs each remote model call in `runs.jsonl`.
- **Languages.** Every shot carries Amharic, Afaan Oromo and English narration. Afaan Oromo is not in the speech model's documented language list (F02). **[AUTHOR: result of a native listener's check, if done.]**

## What I would build next

- Write the score as FLAC on Kaggle from the start, and keep model weights in a Kaggle dataset so each run does not reinstall them.
- A blind preference test between image-to-video clips and pan-and-zoom on the same shots, with five viewers.
- A pronunciation pass: a native speaker marks every wrong word in the Amharic narration, and the lines are re-taken one by one.
