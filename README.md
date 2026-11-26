# The Teacher Who Listened: a heritage short, built as a pipeline

A 60–90 second film about my aunt, who raised two daughters and taught social studies in Addis Ababa, and who loved to hear her students sing. It is narrated in Amharic (Afaan Oromo and English are selectable), has English subtitles and an end card that says it was made with AI.

The film is not edited by hand. One file, [storyboard.json](storyboard.json), describes every shot, and a small pipeline turns it into keyframes, moving shots, narration, music and two finished exports. Change one shot in the storyboard, rerun, and only that shot is regenerated.

## Run it

You need [Node.js 24 or newer](https://nodejs.org) and nothing else. FFmpeg is installed by `npm install` as a bundled binary.

```bash
git clone <this repository>
cd <this repository>
npm install
cp .env.example .env        # then fill in the three keys described below
npm run film                # the whole pipeline, Amharic narration, both aspect ratios
```

With `make` installed, `make film` does the install and the run in one step.

The finished files appear in `outputs/film/am/`:

| File | What it is |
|---|---|
| `heritage_am_vertical.mp4` | 1080×1920 (9:16), for phone feeds |
| `heritage_am_horizontal.mp4` | 1920×1080 (16:9) |
| `heritage_am.en.srt` | The English subtitles as a separate file |

Every model output the film needs is committed in `outputs/`: the narration, the reference sheets and keyframes, the chosen score and the Wan 2.2 clips. So a fresh clone needs **no keys** to rebuild the film: `npm run film` finds every model step in the cache, calls no model, and only re-renders the FFmpeg steps (about 10 minutes on a laptop). The finished MP4s themselves are not committed, to keep the repository small; they are rebuilt by that command, and the published films are linked in the submission.

To regenerate everything from the storyboard with real model calls, fill in `.env` and run `npm run film -- --force --remote`.

### Setup: the keys

All three are free and need no payment card. They go in `.env`, which is git-ignored.

| Variable | Where to get it | Used for |
|---|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) → Get API key | Narration (text to speech), translation |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers AI → Use REST API | Keyframes |
| `CLOUDFLARE_API_TOKEN` | Same page, "Create a Workers AI API token" | Keyframes |
| `KAGGLE_API_TOKEN` | kaggle.com → Settings → API → Create New Token (phone verification required for GPUs). Optional | Music and image-to-video on a free GPU |

The Kaggle stages also need the Kaggle command-line client, which is Python: `pip install kaggle`.

Check that every provider answers before a long run:

```bash
npm run smoke
```

## Commands

| Command | What it does |
|---|---|
| `npm run film` | Validate → narration → keyframes → music → shots → assemble |
| `npm run film -- --remote` | The same, but first runs the GPU stages on Kaggle: ACE-Step score candidates, and Wan 2.2 clips for shots marked `i2v` |
| `npm run kaggle -- music` | Only the Kaggle music job |
| `npm run kaggle -- video --only s03,s09` | Only the Kaggle image-to-video job, for the named shots |
| `npm run radio` | Narration over placeholder music on a black screen: the prototype for the first user test |
| `npm run validate` | Check `storyboard.json` against the schema and the cross-field rules |
| `npm run smoke` | Call each provider once and log its latency |
| `npm run script` | Report narration length per language against the 60–90 second budget |
| `npm run script -- --from story.txt --langs am,en` | Draft a whole storyboard from a story in a text file, for review |
| `npm run ui` | Open the same pipeline as a local web page |
| `npm run costs` | Summarise `runs.jsonl` into latency, GPU minutes and list-price cost per stage |
| `npm test` | Unit tests for the contract, the cache key and the subtitles |

Each stage can also be run alone: `npm run narration`, `keyframes`, `music`, `shots`, `assemble`.

Options, passed after `--`:

| Option | Meaning |
|---|---|
| `--lang am` | Narration language: `am` (default), `om` or `en`. Subtitles are always English |
| `--aspect vertical` | `vertical`, `horizontal` or `both` (default) |
| `--only s05` | Limit per-shot work to the named shots, comma-separated |
| `--force` | Ignore the cache and regenerate |

### Regenerating one shot

Edit one shot's `image_prompt` or narration line in `storyboard.json`, then:

```bash
npm run film
```

Every other shot is reported as `cached`, and `runs.jsonl` gains one `model_call` line per changed output and a `cache_hit` line for everything else. The lines of one command share a `run_id`.

## Making a film of your own story

The pipeline knows nothing about this particular film. Everything about it is in `storyboard.json`, so a different storyboard makes a different film. There are three ways to get one:

1. **Write it by hand**, following [schema/storyboard.schema.json](schema/storyboard.schema.json).
2. **Draft it from a story.** Put a few sentences in a text file and run `npm run script -- --from story.txt --langs am,en`. A text model proposes the shots, narration and prompts; code adds the ids, seeds and camera moves and validates the result. The draft is written to `storyboard.draft.json` so nothing is overwritten. Read it, correct it, then rename it to `storyboard.json`.
3. **Use the page.** `npm run ui` starts a local page at http://localhost:4173 with the same steps: write the story, review each shot, save, make the radio cut or the film, and watch the result. It serves only your own machine and runs the same commands as the terminal.

A draft is a starting point. The model is told to use only the facts in the story, but it is a real person's story, so every line should be read before anything is generated.

## How it is built

```
storyboard.json ──► validate ──► narration ──► keyframes ──► music ──► shots ──► assemble ──► outputs/film/
   (the contract)      │            │             │           │          │           │
                       └────────────┴─────────────┴───────────┴──────────┴───────────┴──► runs.jsonl
```

| Stage | Script | Model | Runs on |
|---|---|---|---|
| Script | [pipeline/script.ts](pipeline/script.ts) | Gemini 3.8 Flash (translation drafts) | Gemini API |
| Narration | [pipeline/narration.ts](pipeline/narration.ts) | Gemini 3.8 Flash TTS | Gemini API |
| Keyframes | [pipeline/keyframes.ts](pipeline/keyframes.ts) | FLUX.2 klein 4B | Cloudflare Workers AI |
| Moving shots | [pipeline/shots.ts](pipeline/shots.ts) | Wan 2.2 TI2V-5B, or a pan-and-zoom fallback | Kaggle notebook, or local FFmpeg |
| Music | [pipeline/music.ts](pipeline/music.ts) | ACE-Step 1.5, or a synthesized placeholder | Kaggle notebook, or local FFmpeg |
| Assembly | [pipeline/assemble.ts](pipeline/assemble.ts) | none | Local FFmpeg |

[ARCHITECTURE.md](ARCHITECTURE.md) explains the contract, the caching and the failure handling.

### The GPU stages

Wan 2.2 and ACE-Step need a GPU, so they run on Kaggle. The scripts in [kaggle/](kaggle/) are the notebooks. [pipeline/kaggle.ts](pipeline/kaggle.ts) does the hand-off from this machine: it writes the job from the storyboard, uploads keyframes as a private dataset, pushes the notebook to run on a T4, waits, downloads the results into `outputs/`, and copies the notebook's own log of each model call into `runs.jsonl`. A clip carries the hash of the keyframe, prompt and seed it was made from, and is ignored once any of them changes. Without them the film still builds: shots fall back to a slow pan-and-zoom over the keyframe and the music falls back to a placeholder pad, and each fallback is recorded in `runs.jsonl`.

## What it costs

Nothing was paid for. Measured latency, GPU minutes and the list-price equivalent of every stage are in [COSTS.md](COSTS.md), generated from [runs.jsonl](runs.jsonl).

## The documents

| File | Contents |
|---|---|
| [DESIGN.md](DESIGN.md) | Audience, intent, the reason for every shot, the two user tests and what changed |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stages, contracts, caching, failure handling |
| [EXPERIMENTS.md](EXPERIMENTS.md) | Hypothesis → change → result |
| [FAILURES.md](FAILURES.md) | What broke, what was tried, what fixed it |
| [COSTS.md](COSTS.md) | Measured latency and cost per stage |
| [ETHICS.md](ETHICS.md) | Consent, licences, labelling |

## Made with AI

The images, the narrator's voice and the music in this film are AI-generated, and the film says so on its end card and in its file metadata. Most of the pipeline code was written by a coding agent under my direction. The story is true. Consent and licences are recorded in [ETHICS.md](ETHICS.md).
