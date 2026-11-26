// Prompt assembly. Consistency comes from attaching the same character wording and style block to every prompt.
import type { Character, Shot, Storyboard } from "./storyboard.ts";

export function charactersIn(sb: Storyboard, shot: Shot): Character[] {
  return shot.characters.map((id) => sb.characters.find((c) => c.id === id)!);
}

/** The reference sheet prompt: the character alone, in the film's style. */
export function sheetPrompt(sb: Storyboard, character: Character): string {
  return `${character.sheet_prompt}. ${sb.style.style_block}.`;
}

/**
 * The keyframe prompt: what the shot shows, the fixed character descriptions, then the fixed style block.
 * When reference images are attached, the prompt says which image is which character.
 */
export function keyframePrompt(sb: Storyboard, shot: Shot, withReferences: boolean): string {
  const cast = charactersIn(sb, shot);
  const parts = [shot.image_prompt];
  if (cast.length) {
    const described = cast.map((character, i) => (withReferences ? `${character.description} (same person as in reference image ${i + 1})` : character.description));
    parts.push(`Characters: ${described.join("; ")}`);
  }
  parts.push(sb.style.style_block);
  return parts.join(". ") + ".";
}
