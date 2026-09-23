import { PROJECT_FILES, Tutorial } from "@studio/shared";
import { readJsonAs, writeJson } from "@studio/shared/node";
import { getStore } from "@/lib/data";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  return Response.json(await readJsonAs(store.pathFor(id, PROJECT_FILES.tutorial), Tutorial));
}

/** Saves a reviewed tutorial. Validated with the same schema the pipeline uses. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  const parsed = Tutorial.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const steps = [...parsed.data.steps].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i + 1 }));
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) return Response.json({ error: ["duplicate step ids"] }, { status: 400 });
  await writeJson(store.pathFor(id, PROJECT_FILES.tutorial), { ...parsed.data, steps });
  const p = await store.require(id);
  if (p.status === "NEEDS_REVIEW" && steps.every((s) => s.review.status !== "needs_review")) await store.setStatus(id, "READY_FOR_SCRIPT", "review complete");
  return Response.json({ ok: true, steps: steps.length });
}
