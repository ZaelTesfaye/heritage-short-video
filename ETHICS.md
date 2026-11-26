# Consent, labelling and licences

## Consent

The film is about a real person: my aunt. Her two daughters also appear as characters.

| Question | Answer |
|---|---|
| Does a real person's face appear? | No. Every person in the film is an invented illustration generated from a written description. No photograph of my aunt or her daughters was given to any model, and the descriptions were not written to resemble them |
| Does a real person's voice appear? | No. The narrator is a stock text-to-speech voice (`Sulafat`, Gemini TTS). No voice was cloned |
| Are words put in a real person's mouth? | No. Nobody in the film speaks. The narration is in the voice of a family member speaking about her |
| Is a real person named? | No. The narration says "my aunt"; no names are used |

Because the story is hers, the film is not posted until she, or the family on her behalf, has agreed.

**Consent record: NOT YET RECORDED.** To be completed before the film is posted.

| | |
|---|---|
| Who was asked | |
| Date | |
| How (in person, phone, message) | |
| What they were told | That the story would be made into a short film using AI-generated pictures, voice and music; that it would be posted publicly; that the code and script would be public on GitHub |
| What they agreed to | |
| Anything they asked to change or leave out | |

## Private details

Free API tiers may use what is sent to them to improve their models. Only the narration lines and the image descriptions in `storyboard.json` are sent to any provider. They contain no names, addresses, dates or other identifying family details.

## Labelling

| Where | How it is labelled |
|---|---|
| In the film | A 3.5 second end card: "Made with AI. The images, the narrator's voice and the music in this film are AI-generated. Based on a true family story." The storyboard validator rejects an end card that does not mention AI |
| In the file | The MP4 `comment` metadata lists the models used for images, voice and music |
| On the platform | The platform's AI-content disclosure is switched on when posting |
| Watermarks | Nothing in the pipeline removes or alters provenance marks. Gemini's audio output is used as returned and only mixed and encoded |
| In the repository | The README states that the media is AI-generated and that a coding agent wrote most of the code |

## Licences

Checked on 2026-11-26. Sources are the model pages and the project brief; "per the brief" marks a licence I have not yet read at its source.

| Component | Used for | Licence or terms | Note |
|---|---|---|---|
| Gemini 3.8 Flash TTS | Narration | Gemini API Additional Terms of Service | Free tier; inputs may be used to improve Google's products |
| Gemini 3.8 Flash | Translation drafts | Gemini API Additional Terms of Service | Same |
| FLUX.2 klein 4B on Cloudflare Workers AI | Keyframes | Apache 2.0 for the 4B weights, per the brief; Cloudflare links to Black Forest Labs' terms of service | The 9B version is non-commercial and is not used |
| Wan 2.2 TI2V-5B | Moving shots | Apache 2.0 (model card) | Run on Kaggle through diffusers; keyframes are uploaded as a private dataset |
| ACE-Step 1.5 | Score | Code is MIT (checked in the repository's LICENSE and pyproject). The weights repository did not state a licence on the pages I read; the brief says outputs may be used commercially | Run on Kaggle; instrumental only, so no lyrics or voices are imitated |
| FFmpeg, via `ffmpeg-static` | Assembly | The bundled Windows build is GPL v3 | Used as a separate program, not linked into this code |
| Ajv | Schema validation | MIT | |
| This repository's code | | To be chosen by the author | |

## Where the data went

| Provider | What was sent |
|---|---|
| Google Gemini | The narration lines in Amharic, Afaan Oromo and English |
| Cloudflare Workers AI | Image prompts and the two generated reference sheets |
| Kaggle | The music caption, the motion prompts, and the generated keyframes for the clip shots, in a private dataset |

No photograph, recording, name or address of a real person was sent anywhere.

## Style

The look is described by its qualities (hand-painted gouache, warm earthy palette, golden light). No artist, living or dead, is named in any prompt.
