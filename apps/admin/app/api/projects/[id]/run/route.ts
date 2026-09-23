import { STAGE_ORDER, type StageName } from "@studio/shared";
import { getStore } from "@/lib/data";
import { spawnStudio } from "@/lib/runner";

/** Starts (or resumes) the pipeline in a background CLI process. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { from?: string; preset?: string; fidelity?: string };
  const store = await getStore();
  await store.require(id);
  const args = ["run", id, "--auto-approve"];
  if (body.from && STAGE_ORDER.includes(body.from as StageName)) args.push("--from", body.from);
  if (body.preset) {
    const p = await store.require(id);
    await store.save({ ...p, settings: { ...p.settings, stylePreset: body.preset as never } });
  }
  if (body.fidelity) {
    const p = await store.require(id);
    await store.save({ ...p, settings: { ...p.settings, fidelityMode: body.fidelity as never } });
  }
  const pid = spawnStudio(args, store.pathFor(id, "logs"));
  return Response.json({ started: true, pid, args });
}
