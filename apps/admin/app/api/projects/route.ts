import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isSupportedVideo } from "@studio/shared";
import { ROOT, getStore } from "@/lib/data";
import { spawnStudio } from "@/lib/runner";

export async function GET() {
  return Response.json(await (await getStore()).list());
}

/** Upload a source Short and start processing it. */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !isSupportedVideo(file.name)) return Response.json({ error: "MP4 / MOV / WebM file required" }, { status: 400 });
  const dir = join(ROOT, "input", "uploads");
  await mkdir(dir, { recursive: true });
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = join(dir, safe);
  await writeFile(path, Buffer.from(await file.arrayBuffer()));
  spawnStudio(["run", path, "--auto-approve"], join(ROOT, "input", "uploads", "logs"));
  return Response.json({ ok: true, file: safe });
}
