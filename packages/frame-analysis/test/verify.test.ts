import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ffmpeg, hasCommand } from "@studio/shared/node";
import { findTextInVideo } from "../src/index";

const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

async function clip(text: string): Promise<string> {
  const out = join(await mkdtemp(join(tmpdir(), "vv-")), "c.mp4");
  await ffmpeg(["-f", "lavfi", "-i", "color=c=white:s=540x960:d=2", "-vf", `drawtext=fontfile=${FONT}:text='${text}':fontsize=36:fontcolor=black:x=40:y=400`, "-pix_fmt", "yuv420p", out]);
  return out;
}

describe.skipIf(!(await hasCommand("tesseract")))("post-render privacy check", () => {
  it("finds source personal data that is visible in the video", async () => {
    const video = await clip("Owner\\: John Smith");
    const hits = await findTextInVideo(video, ["John Smith", "Maria Garcia"]);
    expect(hits.map((h) => h.needle)).toContain("John Smith");
    expect(hits.some((h) => h.needle === "Maria Garcia")).toBe(false);
  }, 60_000);
  it("reports nothing for dummy data", async () => {
    const video = await clip("Owner\\: Noa Park");
    expect(await findTextInVideo(video, ["John Smith"])).toEqual([]);
  }, 60_000);
});
