// Story -> storyboard. A text model proposes the creative parts; code builds the contract around them
// (ids, seeds, camera moves, defaults) and validates it. The result is a draft for a person to review,
// never something to generate from unread.
import { loadConfig } from "./env.ts";
import { geminiText } from "./gemini.ts";
import { callModel } from "./model.ts";
import { validateStoryboard } from "./storyboard.ts";
import type { KenBurns, Storyboard } from "./storyboard.ts";

export const LANGUAGE_NAMES: Record<string, string> = {
  am: "Amharic",
  om: "Afaan Oromo",
  en: "English",
  ti: "Tigrinya",
  so: "Somali",
};

export interface DraftRequest {
  story: string;
  audience?: string;
  intent?: string;
  /** Narration language codes; the first is the default language. */
  languages: string[];
}

export interface DraftResult {
  storyboard: Storyboard;
  /** Validation errors left after the last attempt. Empty means the draft is a valid storyboard. */
  errors: string[];
  attempts: number;
}

/** Named camera moves the model may choose from, mapped to pan-and-zoom parameters. */
const CAMERA_MOVES: Record<string, KenBurns> = {
  push_in: { zoom_from: 1.0, zoom_to: 1.14, x_from: 0.5, x_to: 0.5, y_from: 0.5, y_to: 0.45 },
  pull_out: { zoom_from: 1.16, zoom_to: 1.0, x_from: 0.5, x_to: 0.5, y_from: 0.45, y_to: 0.5 },
  pan_left: { zoom_from: 1.1, zoom_to: 1.1, x_from: 0.8, x_to: 0.2, y_from: 0.5, y_to: 0.5 },
  pan_right: { zoom_from: 1.1, zoom_to: 1.1, x_from: 0.2, x_to: 0.8, y_from: 0.5, y_to: 0.5 },
  tilt_up: { zoom_from: 1.1, zoom_to: 1.1, x_from: 0.5, x_to: 0.5, y_from: 0.75, y_to: 0.25 },
  tilt_down: { zoom_from: 1.1, zoom_to: 1.1, x_from: 0.5, x_to: 0.5, y_from: 0.25, y_to: 0.75 },
  hold: { zoom_from: 1.02, zoom_to: 1.07, x_from: 0.5, x_to: 0.5, y_from: 0.5, y_to: 0.5 },
};

const SHOT_SIZES = ["extreme_wide", "wide", "medium", "medium_close_up", "close_up", "insert"];
const END_CARD_S = 3.5;

function buildPrompt(request: DraftRequest): string {
  const languages = request.languages.map((code) => `"${code}" (${LANGUAGE_NAMES[code] ?? code})`).join(", ");
  return `You are planning a 60 to 90 second short film that tells a true family story with narration over illustrated shots.

THE STORY, in the teller's own words:
"""
${request.story.trim()}
"""
${request.audience ? `WHO IT IS FOR: ${request.audience}\n` : ""}${request.intent ? `WHAT THEY SHOULD FEEL AT THE END: ${request.intent}\n` : ""}
Rules:
- This is about real people. Use only the facts in the story. You may add ordinary visual detail (light, a room, an object) but never invent events, names, dates, places or quotes.
- 9 to 11 shots. One idea and one gentle movement per shot. Vary shot sizes: open wide to establish the place, use close-ups for feeling.
- Every shot needs a one-sentence reason it exists.
- Shot durations in seconds must add up to between 62 and 82.
- Narration is written for the ear: one or two short sentences per shot, at most 22 words, concrete, no tongue-twisters. Write it in each of these languages: ${languages}. Write each language naturally, not word for word.
- "subtitle" is the English meaning of the narration line.
- Image prompts describe what the shot shows. Never ask for text, signs or writing in an image. Keep the main subject centred.
- Define at most two characters. Give each a fixed description (age, face, hair, clothing with colours) to be reused word for word, and do not describe real people's actual looks.
- "style_block" describes one consistent illustrated look by its qualities (medium, palette, light). Never name an artist.
- "motion_prompt" describes only movement and camera, since the image already shows the subject.
- "camera" is one of: ${Object.keys(CAMERA_MOVES).join(", ")}. Vary it between consecutive shots.
- "motion_mode" is "i2v" for shots with people moving and "kenburns" for places and objects.
- The music is an instrumental score that leaves room for a narrator.

Reply with one JSON object and nothing else, in exactly this shape:
{
  "title": "string",
  "logline": "one sentence",
  "audience": "string",
  "intent": "string",
  "style_block": "string",
  "characters": [{ "id": "lowercase_id", "description": "string", "sheet_prompt": "a character reference sheet prompt showing the character alone on a plain background" }],
  "narration_style": "delivery, such as: warm, calm and unhurried",
  "music": { "caption": "style, mood, instruments, texture", "bpm": 70, "key": "C major" },
  "shots": [{
    "reason": "string",
    "shot_size": "one of: ${SHOT_SIZES.join(", ")}",
    "duration_s": 7,
    "characters": ["ids of characters visible"],
    "image_prompt": "string",
    "motion_mode": "kenburns or i2v",
    "motion_prompt": "string",
    "camera": "string",
    "narration": { ${request.languages.map((code) => `"${code}": "string"`).join(", ")} },
    "subtitle": "English",
    "music_cue": "string or empty"
  }]
}`;
}

/** Pulls the JSON object out of a model reply that may wrap it in a code fence or a sentence. */
function extractJson(reply: string): any {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the model's reply contained no JSON object");
  return JSON.parse(reply.slice(start, end + 1));
}

/** Builds a full storyboard from the model's creative draft. Everything mechanical is decided here, not by the model. */
function assemble(draft: any, request: DraftRequest): Storyboard {
  const today = new Date().toISOString().slice(0, 10);
  const model = loadConfig().models.text.model;
  const shots: any[] = Array.isArray(draft.shots) ? draft.shots : [];

  // Durations are arithmetic, so fix them here instead of asking the model again.
  const planned = shots.reduce((sum, s) => sum + (Number(s.duration_s) || 0), 0);
  const scale = planned > 0 && (planned < 62 || planned > 82) ? 72 / planned : 1;

  return {
    version: 1,
    title: String(draft.title ?? "Untitled"),
    logline: String(draft.logline ?? ""),
    meta: {
      audience: request.audience?.trim() || String(draft.audience ?? ""),
      intent: request.intent?.trim() || String(draft.intent ?? ""),
      default_language: request.languages[0],
      languages: request.languages.map((code) => ({
        code,
        name: LANGUAGE_NAMES[code] ?? code,
        review: `Drafted by ${model} on ${today} from the teller's story. Not yet checked by a native speaker.`,
      })),
      fps: 24,
      target_duration_s: { min: 60, max: 90 },
    },
    style: { style_block: String(draft.style_block ?? "") },
    characters: (Array.isArray(draft.characters) ? draft.characters : []).map((c: any, i: number) => ({
      id: String(c.id ?? `character_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "c_"),
      description: String(c.description ?? ""),
      sheet_prompt: String(c.sheet_prompt ?? ""),
      seed: 4101 + i,
    })),
    narration: { voice: "Sulafat", style: String(draft.narration_style ?? "warm, calm and unhurried"), lead_in_s: 0.4, tail_s: 0.7 },
    music: {
      caption: String(draft.music?.caption ?? ""),
      bpm: Math.round(Number(draft.music?.bpm) || 70),
      key: String(draft.music?.key ?? "C major"),
      duration_s: 85,
      candidates: [
        { id: "cand_a", seed: 11 },
        { id: "cand_b", seed: 23 },
        { id: "cand_c", seed: 47 },
      ],
      chosen: null,
      chosen_reason: "",
      cues: [],
    },
    end_card: {
      lines: ["Made with AI", "The images, the narrator's voice and the music", "in this film are AI-generated.", "Based on a true family story."],
      duration_s: END_CARD_S,
    },
    shots: shots.map((s, i) => {
      const shot: Storyboard["shots"][number] = {
        id: `s${String(i + 1).padStart(2, "0")}`,
        reason: String(s.reason ?? ""),
        shot_size: SHOT_SIZES.includes(s.shot_size) ? s.shot_size : "medium",
        duration_s: Math.round((Number(s.duration_s) || 7) * scale * 2) / 2,
        characters: Array.isArray(s.characters) ? s.characters.map((id: unknown) => String(id).toLowerCase()) : [],
        image_prompt: String(s.image_prompt ?? ""),
        seed: 1001 + i,
        motion: {
          mode: s.motion_mode === "i2v" ? "i2v" : "kenburns",
          prompt: String(s.motion_prompt ?? ""),
          kenburns: CAMERA_MOVES[s.camera] ?? CAMERA_MOVES.push_in,
        },
        narration: Object.fromEntries(request.languages.map((code) => [code, String(s.narration?.[code] ?? "")])),
        subtitle: String(s.subtitle ?? ""),
      };
      if (s.music_cue) shot.music_cue = String(s.music_cue);
      return shot;
    }),
  };
}

export async function draftStoryboard(request: DraftRequest): Promise<DraftResult> {
  if (request.story.trim().length < 40) throw new Error("Tell the story in at least a few sentences first.");
  if (!request.languages.length) throw new Error("Choose at least one narration language.");
  const model = loadConfig().models.text.model;
  const basePrompt = buildPrompt(request);

  let prompt = basePrompt;
  let storyboard: Storyboard | null = null;
  let errors: string[] = [];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await callModel(
      { stage: "script", provider: "gemini", model, shot: "draft", params: { task: "story_to_storyboard", languages: request.languages, story_characters: request.story.length, repair_round: attempt - 1 } },
      async () => {
        const result = await geminiText({ model, prompt });
        return { value: result.text, cost_usd: result.cost_usd, details: { usage: result.usage, reply_characters: result.text.length } };
      },
    );
    try {
      storyboard = assemble(extractJson(reply), request);
      errors = validateStoryboard(storyboard).errors;
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
    }
    if (!errors.length) return { storyboard: storyboard!, errors: [], attempts: attempt };

    // Repair round: show the model exactly what the validator rejected.
    prompt = `${basePrompt}\n\nYour previous reply was rejected by the validator for these reasons:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nReply again with the complete corrected JSON object.`;
  }

  if (!storyboard) throw new Error(`The model did not return a usable storyboard after ${maxAttempts} attempts: ${errors.join("; ")}`);
  return { storyboard, errors, attempts: maxAttempts };
}
