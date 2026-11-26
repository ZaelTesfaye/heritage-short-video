// Cloudflare Workers AI client for FLUX image generation.
import { loadConfig, requireEnv } from "./env.ts";
import { httpError } from "./model.ts";

const TIMEOUT_MS = 180_000;

export interface ImageRequest {
  model: string;
  prompt: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  /** Reference images (character sheets). Only FLUX.2 models accept them. */
  references?: { name: string; png: Buffer }[];
}

export interface ImageResult {
  image: Buffer;
  cost_usd: number | null;
  references_used: number;
}

/** FLUX.2 models can be conditioned on reference images; FLUX.1 schnell is text-only. */
export function supportsReferences(model: string): boolean {
  return model.includes("flux-2");
}

export async function cloudflareImage(request: ImageRequest): Promise<ImageResult> {
  const account = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${request.model}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const references = supportsReferences(request.model) ? (request.references ?? []) : [];

  let body: FormData | string;
  if (supportsReferences(request.model)) {
    // FLUX.2 on Workers AI takes multipart form data; reference images go in input_image_0, input_image_1, ...
    const form = new FormData();
    form.append("prompt", request.prompt);
    form.append("width", String(request.width));
    form.append("height", String(request.height));
    form.append("steps", String(request.steps));
    form.append("seed", String(request.seed));
    references.forEach((ref, i) => {
      form.append(`input_image_${i}`, new Blob([new Uint8Array(ref.png)], { type: "image/png" }), `${ref.name}.png`);
    });
    body = form;
  } else {
    // FLUX.1 schnell takes JSON and always returns a square image; the keyframe stage crops it to the aspect.
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ prompt: request.prompt, steps: request.steps, seed: request.seed });
  }

  const response = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw await httpError(response);

  let image: Buffer;
  if ((response.headers.get("content-type") ?? "").startsWith("image/")) {
    image = Buffer.from(await response.arrayBuffer());
  } else {
    const json: any = await response.json();
    const base64 = json?.result?.image ?? json?.image;
    if (typeof base64 !== "string") {
      throw new Error(`Cloudflare returned no image. Response: ${JSON.stringify(json).slice(0, 500)}`);
    }
    image = Buffer.from(base64, "base64");
  }
  return { image, cost_usd: imageListPrice(request, references.length), references_used: references.length };
}

/** List-price equivalent from Cloudflare's published per-tile prices (a tile is 512x512 pixels). */
function imageListPrice(request: ImageRequest, referenceCount: number): number | null {
  const price = loadConfig().pricing[request.model];
  if (!price) return null;
  const tiles = Math.ceil((request.width * request.height) / (512 * 512));
  if (price.usd_per_output_tile_512 !== undefined) {
    // Reference sheets are 1024x1024, which is 4 input tiles each.
    return tiles * price.usd_per_output_tile_512 + referenceCount * 4 * price.usd_per_input_tile_512;
  }
  if (price.usd_per_tile_512 !== undefined) {
    return 4 * price.usd_per_tile_512 + request.steps * price.usd_per_step;
  }
  return null;
}
