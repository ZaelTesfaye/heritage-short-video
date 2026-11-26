// A local web page over the same pipeline: tell a story, review the storyboard, run the stages, watch the result.
// It adds no logic of its own. Runs are started as the same `pipeline/run.ts` command the terminal uses.
//   npm run ui      then open http://localhost:4173
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, ROOT, loadEnv, readJson } from "../lib/env.ts";
import { LANGUAGE_NAMES, draftStoryboard } from "../lib/draft.ts";
import { RUNS_FILE } from "../lib/runlog.ts";
import { STORYBOARD_FILE, validateStoryboard } from "../lib/storyboard.ts";

const PORT = Number(process.env.PORT ?? 4173);
const HERE = dirname(fileURLToPath(import.meta.url));
const MEDIA_TYPES: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".wav": "audio/wav", ".srt": "text/plain; charset=utf-8", ".json": "application/json" };

// ---- one pipeline run at a time, with its log kept for the page ----
let child: ChildProcess | null = null;
let log: string[] = [];
const listeners = new Set<ServerResponse>();

function emit(event: string, data: unknown): void {
  for (const res of listeners) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function pushLog(text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    log.push(line);
    if (log.length > 600) log.shift();
    emit("log", line);
  }
}

function startRun(body: any): string | null {
  if (child) return "A run is already in progress.";
  const command = body.command;
  if (command !== "film" && command !== "radio") return "Unknown command.";
  const args = ["pipeline/run.ts", command];
  // Arguments are checked against strict patterns, and no shell is involved.
  if (body.lang) {
    if (!/^[a-z]{2,3}$/.test(body.lang)) return "Invalid language code.";
    args.push("--lang", body.lang);
  }
  if (body.only) {
    if (!/^s\d{2}(,s\d{2})*$/.test(body.only)) return "Invalid shot list.";
    args.push("--only", body.only);
  }
  if (body.aspect && ["vertical", "horizontal", "both"].includes(body.aspect)) args.push("--aspect", body.aspect);
  if (body.force === true) args.push("--force");

  log = [];
  pushLog(`$ node ${args.join(" ")}`);
  child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
  child.stdout?.on("data", (chunk: Buffer) => pushLog(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => pushLog(chunk.toString()));
  child.on("close", (code) => {
    child = null;
    emit("done", { code });
  });
  emit("started", { command });
  return null;
}

// ---- what exists on disk ----
function listMedia(dir: string): string[] {
  const full = join(OUT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { recursive: true })
    .map((entry) => `${dir}/${String(entry).replaceAll("\\", "/")}`)
    .filter((path) => [".mp4", ".png"].includes(extname(path)));
}

function mediaEntry(path: string) {
  const stat = statSync(join(OUT, path));
  // The modification time is added so the browser refetches a file that was regenerated.
  return { path, url: `/media/${path}?v=${Math.floor(stat.mtimeMs)}`, bytes: stat.size };
}

function state() {
  loadEnv();
  const storyboard = existsSync(STORYBOARD_FILE) ? readJson(STORYBOARD_FILE) : null;
  return {
    storyboard,
    validation: storyboard ? validateStoryboard(storyboard) : { errors: ["storyboard.json does not exist yet"], warnings: [] },
    language_names: LANGUAGE_NAMES,
    keys: { gemini: !!process.env.GEMINI_API_KEY?.trim(), cloudflare: !!process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && !!process.env.CLOUDFLARE_API_TOKEN?.trim() },
    running: !!child,
    log,
    films: listMedia("film").map(mediaEntry),
    radio: listMedia("radio").map(mediaEntry),
    keyframes: listMedia("keyframes").map(mediaEntry),
  };
}

function recentRuns(limit: number): unknown[] {
  if (!existsSync(RUNS_FILE)) return [];
  return readFileSync(RUNS_FILE, "utf8").split("\n").filter(Boolean).slice(-limit).map((line) => JSON.parse(line)).reverse();
}

// ---- http ----
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 2_000_000) throw new Error("Request too large.");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function serveMedia(req: IncomingMessage, res: ServerResponse, relative: string): void {
  const file = resolve(OUT, decodeURIComponent(relative));
  // Only files inside outputs/ are served.
  if (!file.startsWith(resolve(OUT) + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const size = statSync(file).size;
  const type = MEDIA_TYPES[extname(file)] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    // Video players ask for byte ranges so they can seek.
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(readFileSync(join(HERE, "index.html")));
    } else if (route === "GET /api/state") {
      json(res, 200, state());
    } else if (route === "GET /api/runs") {
      json(res, 200, recentRuns(60));
    } else if (route === "POST /api/storyboard") {
      // Saving goes through the same validator as every stage: an invalid storyboard is never written.
      const storyboard = await readBody(req);
      const validation = validateStoryboard(storyboard);
      if (validation.errors.length) return json(res, 422, validation);
      writeFileSync(STORYBOARD_FILE, JSON.stringify(storyboard, null, 2) + "\n");
      json(res, 200, validation);
    } else if (route === "POST /api/draft") {
      const body = await readBody(req);
      const languages = Array.isArray(body.languages) ? body.languages.filter((code: unknown) => typeof code === "string" && /^[a-z]{2,3}$/.test(code)) : [];
      json(res, 200, await draftStoryboard({ story: String(body.story ?? ""), audience: body.audience, intent: body.intent, languages }));
    } else if (route === "POST /api/run") {
      const error = startRun(await readBody(req));
      json(res, error ? 409 : 202, error ? { error } : { started: true });
    } else if (route === "GET /api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(": connected\n\n");
      listeners.add(res);
      req.on("close", () => listeners.delete(res));
    } else if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      serveMedia(req, res, url.pathname.slice("/media/".length));
    } else {
      res.writeHead(404).end("Not found");
    }
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

// Bound to this machine only: the page can start pipeline runs, so it is not offered to the network.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Heritage Short studio is running at http://localhost:${PORT}\nPress Ctrl+C to stop.`);
});
