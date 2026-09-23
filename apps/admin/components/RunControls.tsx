"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@studio/shared";

const STAGES = ["ingest", "transcribe", "analyze_frames", "detect_actions", "extract_tutorial", "reconstruct_screens", "write_script", "voice", "subtitles", "plan_render", "guide", "seo", "render"];
const ACTIVE: ProjectStatus[] = ["ANALYZING", "GENERATING_VOICE", "RENDERING"];

export function RunControls({ projectId, status, isManual, preset, fidelity }: { projectId: string; status: ProjectStatus; isManual: boolean; preset: string; fidelity: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(isManual ? "write_script" : "ingest");
  const [stylePreset, setPreset] = useState(preset);
  const [fid, setFid] = useState(fidelity);
  const [msg, setMsg] = useState<string | null>(null);
  const [polling, setPolling] = useState(ACTIVE.includes(status));
  const last = useRef<string>("");

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      const s = await fetch(`/api/projects/${projectId}/status`).then((r) => r.json());
      const sig = JSON.stringify([s.status, s.updatedAt]);
      if (sig !== last.current) {
        last.current = sig;
        router.refresh();
      }
      if (s.status === "COMPLETE" || s.status === "ERROR" || s.status === "NEEDS_REVIEW") setPolling(false);
    }, 2500);
    return () => clearInterval(t);
  }, [polling, projectId, router]);

  const run = async (body: Record<string, string>) => {
    setMsg("מתחיל…");
    const r = await fetch(`/api/projects/${projectId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setMsg(r.ok ? "רץ ברקע — הדף יתעדכן" : "שגיאה בהפעלה");
    setPolling(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <button onClick={() => run({ preset: stylePreset, fidelity: fid })} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">
        הרצה / המשך
      </button>
      <label className="flex items-center gap-2">
        מתחילים משלב
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="ltr rounded border px-2 py-1">
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => run({ from, preset: stylePreset, fidelity: fid })} className="rounded-lg border px-3 py-1.5 font-bold">
          הרצה מחדש
        </button>
      </label>
      <label className="flex items-center gap-2">
        סגנון
        <select value={stylePreset} onChange={(e) => setPreset(e.target.value)} className="ltr rounded border px-2 py-1">
          {["modern-saas", "clean", "illustrated", "dark"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        נאמנות
        <select value={fid} onChange={(e) => setFid(e.target.value)} className="ltr rounded border px-2 py-1">
          {["faithful", "simplified", "conceptual"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {polling ? <span className="animate-pulse text-indigo-700">מעבד…</span> : null}
      {msg ? <span className="text-slate-500">{msg}</span> : null}
    </div>
  );
}
