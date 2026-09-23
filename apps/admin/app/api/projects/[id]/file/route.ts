import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { getStore, outputDir } from "@/lib/data";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".srt": "text/plain; charset=utf-8",
};

/** Serves a file from a project dir (or its output dir with "@output/"), with Range support for video seeking. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  const store = await getStore();
  const base = rel.startsWith("@output/") ? resolve(await outputDir(), id) : store.dirFor(id);
  const file = resolve(base, rel.replace(/^@output\//, ""));
  if (!file.startsWith(base + sep) || !existsSync(file)) return new Response("not found", { status: 404 });
  const size = statSync(file).size;
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "no-cache" } });
}
