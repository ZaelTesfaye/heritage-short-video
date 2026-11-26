Generated from 338 lines of runs.jsonl (2026-11-26T16:41:30.730Z to 2026-11-26T19:32:56.997Z).

### Per stage

| | Model calls ok | Failed attempts | Cache hits | Local renders | Fallbacks | Model latency total (s) | Mean per call (s) | Local and Kaggle-job wall time (s) | GPU minutes | List-price equivalent (USD) |
|---|---|---|---|---|---|---|---|---|---|---|
| smoke | 1 | 5 | 0 | 1 | 0 | 4.8 | 4.77 | 0.1 | 0.00 | 0.00057 |
| narration | 10 | 5 | 40 | 0 | 1 | 56.5 | 5.65 | 0.0 | 0.00 | 0.01475 |
| music | 3 | 0 | 2 | 1 | 0 | 53.8 | 17.93 | 1227.6 | 0.90 | 0.00000 |
| radio | 0 | 0 | 0 | 1 | 0 | 0.0 | - | 43.9 | 0.00 | 0.00000 |
| keyframes | 42 | 14 | 98 | 0 | 8 | 1759.0 | 41.88 | 0.0 | 0.00 | 0.05530 |
| experiment | 0 | 1 | 0 | 0 | 0 | 0.0 | - | 0.0 | 0.00 | 0.00000 |
| shots | 3 | 4 | 38 | 28 | 18 | 1219.7 | 406.55 | 3594.3 | 20.33 | 0.00000 |
| assemble | 0 | 0 | 3 | 6 | 0 | 0.0 | - | 539.8 | 0.00 | 0.00000 |

### Per model

| | Model calls ok | Failed attempts | Cache hits | Local renders | Fallbacks | Model latency total (s) | Mean per call (s) | Local and Kaggle-job wall time (s) | GPU minutes | List-price equivalent (USD) |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini / gemini-3.8-flash | 0 | 4 | 0 | 0 | 0 | 0.0 | - | 0.0 | 0.00 | 0.00000 |
| gemini / gemini-3.8-flash-tts | 10 | 5 | 0 | 0 | 0 | 55.5 | 5.55 | 0.0 | 0.00 | 0.01413 |
| cloudflare / @cf/black-forest-labs/flux-2-klein-4b | 42 | 15 | 0 | 0 | 0 | 1759.0 | 41.88 | 0.0 | 0.00 | 0.05530 |
| gemini / gemini-3.8-flash-lite-tts | 1 | 0 | 0 | 0 | 0 | 5.8 | 5.83 | 0.0 | 0.00 | 0.00119 |
| gemini / gemini-omni-1.2-flash | 0 | 1 | 0 | 0 | 0 | 0.0 | - | 0.0 | 0.00 | 0.00000 |
| kaggle / ACE-Step/ACE-Step-1.5 | 3 | 0 | 0 | 0 | 0 | 53.8 | 17.93 | 0.0 | 0.90 | 0.00000 |
| kaggle / Wan-AI/Wan2.2-TI2V-5B-Diffusers | 3 | 4 | 0 | 0 | 0 | 1219.7 | 406.55 | 0.0 | 20.33 | 0.00000 |
