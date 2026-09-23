import { getStore } from "@/lib/data";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await (await getStore()).require(id);
  return Response.json({ status: p.status, error: p.error, stages: p.stages, updatedAt: p.updatedAt });
}
