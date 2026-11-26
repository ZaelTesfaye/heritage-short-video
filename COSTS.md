# Costs and measurements

Nothing was paid for. Every model call ran on a free tier or a free GPU. The "list-price equivalent" is what the same calls would cost at the provider's published price, computed per call and stored in the `cost_usd` field of [runs.jsonl](runs.jsonl).

> **Status on 2026-11-26:** no real model calls have been made yet, so the measured tables below are empty. They are filled by running `npm run costs`, which summarises `runs.jsonl`.

## Free-tier limits found

Checked on 2026-11-26 against the providers' own pages.

| Provider | Limit found | Source |
|---|---|---|
| Cloudflare Workers AI | 10,000 neurons per day free, resetting at 00:00 UTC; beyond that $0.011 per 1,000 neurons | Workers AI pricing page |
| Gemini API, speech and text | Listed as free of charge on the standard tier. The rate-limits page does not state per-model numbers and refers to the AI Studio dashboard | Gemini pricing and rate-limits pages |
| Kaggle | To be recorded when the notebooks run | |

## List prices used

These are in [pipeline.config.json](pipeline.config.json) under `pricing`.

| Model | Price | How the equivalent is computed |
|---|---|---|
| Gemini 3.8 Flash TTS | $0.50 per million input text tokens, $9.00 per million output audio tokens, 25 audio tokens per second (stated as valid through 2026-12-31) | Text length ÷ 4 as input tokens, plus measured audio seconds × 25 as output tokens |
| Gemini 3.8 Flash | $0.75 per million input tokens, $3.75 per million output tokens | Character counts ÷ 4 |
| FLUX.2 klein 4B on Cloudflare | $0.000287 per 512×512 output tile, $0.000059 per 512×512 input tile | Output area in tiles, plus 4 input tiles per 1024×1024 reference image |
| FLUX.1 schnell on Cloudflare | $0.0000528 per 512×512 tile, $0.0001056 per step | 4 tiles for a 1024×1024 image, plus steps |
| Wan 2.2, ACE-Step on Kaggle | No list price: open weights on a free GPU | Reported as GPU minutes instead |

Token counts for text are estimates from character length, because Amharic script tokenises differently from English. Where the API returns real usage figures, they are stored in the call's `details` in `runs.jsonl`.

## Expected budget, before measuring

| Stage | Calls for one language, both aspects | Expected list-price equivalent |
|---|---|---|
| Narration | 10 lines, about 60 s of audio | About $0.014 |
| Keyframes | 2 reference sheets and 20 keyframes | About $0.03, and roughly 2,700 of the day's 10,000 free neurons |
| Moving shots, music | Kaggle GPU time | $0 |

## Measured

Filled from `npm run costs`.

### Per stage

| | Model calls ok | Failed attempts | Cache hits | Local renders | Fallbacks | Model latency total (s) | Mean per call (s) | Local render total (s) | GPU minutes | List-price equivalent (USD) |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

### Per model

| | Model calls ok | Failed attempts | Model latency total (s) | Mean per call (s) | GPU minutes | List-price equivalent (USD) |
|---|---|---|---|---|---|---|
| | | | | | | |

## Frontier comparison

No frontier lane was available to me, so there is no measured comparison with Omni Flash, Nano Banana or Lyria.
