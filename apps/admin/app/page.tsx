import Link from "next/link";
import { PROJECT_FILES } from "@studio/shared";
import { existsSync } from "node:fs";
import { getStore, fileUrl } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { Upload } from "@/components/Upload";

export const dynamic = "force-dynamic";

export default async function Home() {
  const store = await getStore();
  const projects = await store.list();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-extrabold">פרויקטים</h1>
        <span className="text-sm text-slate-500">{projects.length} פרויקטים</span>
      </div>
      <Upload />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {projects.map((p) => {
          const poster = existsSync(store.pathFor(p.id, PROJECT_FILES.poster)) ? fileUrl(p.id, PROJECT_FILES.poster) : null;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
              <div className="aspect-[9/12] bg-slate-100">
                {poster ? <img src={poster} alt="" className="h-full w-full object-cover object-top" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">{p.origin === "manual" ? "הדרכה ידנית" : "אין תמונה"}</div>}
              </div>
              <div className="space-y-1.5 p-3">
                <div className="truncate font-bold">{p.name}</div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <StatusBadge status={p.status} />
                  <span className="ltr">{p.media ? `${p.media.durationSec.toFixed(1)}s` : "—"}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
