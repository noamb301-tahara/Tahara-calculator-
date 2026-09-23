import type { ProjectStatus } from "@studio/shared";

const COLORS: Record<ProjectStatus, string> = {
  UPLOADED: "bg-slate-100 text-slate-700",
  ANALYZING: "bg-sky-100 text-sky-800",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  READY_FOR_SCRIPT: "bg-indigo-100 text-indigo-800",
  GENERATING_VOICE: "bg-violet-100 text-violet-800",
  READY_TO_RENDER: "bg-teal-100 text-teal-800",
  RENDERING: "bg-blue-100 text-blue-800",
  COMPLETE: "bg-emerald-100 text-emerald-800",
  ERROR: "bg-rose-100 text-rose-800",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`ltr inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${COLORS[status]}`}>{status}</span>;
}
