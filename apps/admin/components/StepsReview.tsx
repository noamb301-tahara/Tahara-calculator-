"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tutorial, TutorialStep } from "@studio/shared";

const ACTION_TYPES = ["click", "double_click", "right_click", "type", "select", "toggle", "check", "scroll", "hover", "drag", "navigate", "open_menu", "observe"];
const TARGET_TYPES = ["button", "menu_item", "link", "tab", "input", "dropdown", "option", "checkbox", "toggle", "icon", "card", "row", "sidebar_item", "dialog_button", "page", "other"];

type Step = TutorialStep;

const now = () => new Date().toISOString();
const renumber = (steps: Step[]) => steps.map((s, i) => ({ ...s, order: i + 1 }));
let counter = 0;
const newId = (steps: Step[]) => {
  let id: string;
  do id = `step-m${Date.now().toString(36)}${counter++}`;
  while (steps.some((s) => s.id === id));
  return id;
};

/**
 * Module 6 — human review. Edit / Approve / Delete / Merge / Split / Reorder /
 * Add step. Nothing blocks the project: low-confidence steps are flagged, not stopped.
 */
export function StepsReview({ projectId, initial, frameUrl, threshold, isManual }: { projectId: string; initial: Tutorial; frameUrl: Record<string, string>; threshold: number; isManual: boolean }) {
  const [t, setT] = useState<Tutorial>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const steps = [...t.steps].sort((a, b) => a.order - b.order);

  const setSteps = (next: Step[]) => {
    setT({ ...t, steps: renumber(next) });
    setDirty(true);
  };
  const patch = (id: string, p: Partial<Step>, action?: Partial<Step["action"]>) =>
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...p, action: { ...s.action, ...action }, review: { ...s.review, status: p.review?.status ?? (s.review.status === "approved" ? "approved" : "edited"), reviewed_at: now() } } : s)));

  const save = async () => {
    setMsg("שומר…");
    const r = await fetch(`/api/projects/${projectId}/tutorial`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
    const j = await r.json();
    setMsg(r.ok ? "נשמר. הריצו מחדש כדי לייצר את הסרטון מהשלבים המעודכנים." : `שגיאה: ${j.error?.join(", ")}`);
    if (r.ok) {
      setDirty(false);
      router.refresh();
    }
  };
  const regenerate = async () => {
    await fetch(`/api/projects/${projectId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: isManual ? "write_script" : "reconstruct_screens" }) });
    setMsg("מייצר מחדש מהשלבים המאושרים…");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-72 flex-1 rounded-lg border px-3 py-2 text-lg font-bold"
          value={t.title_he}
          onChange={(e) => {
            setT({ ...t, title_he: e.target.value });
            setDirty(true);
          }}
        />
        <button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => setSteps(steps.map((s) => ({ ...s, review: { ...s.review, status: "approved", reviewed_at: now() } })))}>
          אישור כל השלבים
        </button>
        <button disabled={!dirty} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" onClick={save}>
          שמירה
        </button>
        <button disabled={dirty} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" onClick={regenerate}>
          ייצור מחדש
        </button>
        {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
      </div>

      {steps.map((s, i) => {
        const low = s.confidence < threshold;
        const flagged = s.review.status === "needs_review" || (low && s.review.status === "auto");
        const before = s.source.frame_before ? frameUrl[s.source.frame_before] ?? null : null;
        const after = s.source.frame_after ? frameUrl[s.source.frame_after] ?? null : null;
        return (
          <div key={s.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${flagged ? "border-amber-400" : "border-slate-200"}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-3 py-0.5 text-sm font-bold text-white">שלב {s.order}</span>
              <span className="ltr text-xs text-slate-400">{s.id}</span>
              <span className={`ltr rounded-full px-2 py-0.5 text-xs font-bold ${low ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>confidence {s.confidence.toFixed(2)}</span>
              {flagged ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-white">NEEDS REVIEW</span> : null}
              <span className="ltr text-xs text-slate-500">{s.review.status}</span>
              {s.review.notes ? <span className="ltr text-xs text-slate-400">· {s.review.notes}</span> : null}
              <div className="ms-auto flex gap-1 text-sm">
                <Btn onClick={() => patch(s.id, { review: { status: "approved", notes: s.review.notes, reviewed_at: now() } })}>✓ אישור</Btn>
                <Btn disabled={i === 0} onClick={() => setSteps(swap(steps, i, i - 1))}>↑</Btn>
                <Btn disabled={i === steps.length - 1} onClick={() => setSteps(swap(steps, i, i + 1))}>↓</Btn>
                <Btn onClick={() => setSteps([...steps.slice(0, i + 1), { ...s, id: newId(steps), review: { status: "edited", notes: `split from ${s.id}`, reviewed_at: now() } }, ...steps.slice(i + 1)])}>פיצול</Btn>
                <Btn disabled={i === steps.length - 1} onClick={() => setSteps(merge(steps, i))}>מיזוג עם הבא</Btn>
                <Btn danger disabled={steps.length === 1} onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}>מחיקה</Btn>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr]">
              <Frame label="לפני (מקור)" src={before} time={s.source.start_time} />
              <Frame label="אחרי (מקור)" src={after} time={s.source.end_time} />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Field label="פעולה">
                  <select className="ltr w-full rounded border px-2 py-1" value={s.action.type} onChange={(e) => patch(s.id, {}, { type: e.target.value as Step["action"]["type"] })}>
                    {ACTION_TYPES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="סוג רכיב">
                  <select className="ltr w-full rounded border px-2 py-1" value={s.action.target_type} onChange={(e) => patch(s.id, {}, { target_type: e.target.value as Step["action"]["target_type"] })}>
                    {TARGET_TYPES.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="שם הכפתור האמיתי (כפי שבמערכת)">
                  <input className="ltr w-full rounded border px-2 py-1 font-bold" value={s.action.required_real_label} onChange={(e) => patch(s.id, {}, { required_real_label: e.target.value, target_label: e.target.value })} />
                </Field>
                <Field label="תרגום לעברית">
                  <input className="w-full rounded border px-2 py-1" value={s.action.label_he ?? ""} onChange={(e) => patch(s.id, {}, { label_he: e.target.value || null })} />
                </Field>
                <Field label="מיקום">
                  <input className="ltr w-full rounded border px-2 py-1" value={s.action.location_description} onChange={(e) => patch(s.id, {}, { location_description: e.target.value })} />
                </Field>
                <Field label="ערך (הקלדה/בחירה)">
                  <input className="ltr w-full rounded border px-2 py-1" value={s.action.value ?? ""} onChange={(e) => patch(s.id, {}, { value: e.target.value || null })} />
                </Field>
                <Field label="הוראה בעברית" wide>
                  <textarea className="w-full rounded border px-2 py-1" rows={2} value={s.instruction_he} onChange={(e) => patch(s.id, { instruction_he: e.target.value })} />
                </Field>
                <Field label="מה רואים אחרי" wide>
                  <input className="w-full rounded border px-2 py-1" value={s.what_user_sees_after} onChange={(e) => patch(s.id, { what_user_sees_after: e.target.value })} />
                </Field>
                <Field label="אזהרה">
                  <input className="w-full rounded border px-2 py-1" value={s.warning ?? ""} onChange={(e) => patch(s.id, { warning: e.target.value || null })} />
                </Field>
                <Field label="טיפ">
                  <input className="w-full rounded border px-2 py-1" value={s.tip ?? ""} onChange={(e) => patch(s.id, { tip: e.target.value || null })} />
                </Field>
                <label className="col-span-2 flex flex-wrap gap-4 text-xs text-slate-600">
                  {(["needs_zoom", "needs_pointer", "needs_callout"] as const).map((k) => (
                    <span key={k} className="ltr flex items-center gap-1">
                      <input type="checkbox" checked={s[k]} onChange={(e) => patch(s.id, { [k]: e.target.checked } as Partial<Step>)} /> {k}
                    </span>
                  ))}
                  <span className="ltr">screen: {s.screen?.before ?? "—"} → {s.screen?.after ?? "—"} · target: {s.screen?.target_element ?? "—"}</span>
                </label>
              </div>
            </div>
          </div>
        );
      })}

      <button
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 font-bold text-slate-600 hover:bg-white"
        onClick={() => {
          const last = steps[steps.length - 1];
          setSteps([
            ...steps,
            {
              id: newId(steps),
              order: steps.length + 1,
              goal: "",
              instruction_he: "לחצו על …",
              what_user_sees_before: last?.what_user_sees_after ?? "",
              action: { type: "click", target_label: "", target_type: "button", location_description: "", required_real_label: "", label_he: null, value: null },
              what_user_sees_after: "",
              visual_importance: "medium",
              needs_zoom: true,
              needs_pointer: true,
              needs_callout: true,
              warning: null,
              tip: null,
              source: { start_time: last?.source.end_time ?? 0, end_time: last?.source.end_time ?? 0, frame_before: null, frame_after: null, detected_action_id: null },
              confidence: 1,
              review: { status: "edited", notes: "added manually", reviewed_at: now() },
              screen: last?.screen ? { before: last.screen.after ?? last.screen.before, after: null, target_element: null } : null,
            },
          ]);
        }}
      >
        + הוספת שלב ידנית
      </button>
    </div>
  );
}

function swap(steps: Step[], a: number, b: number): Step[] {
  const out = [...steps];
  [out[a], out[b]] = [out[b]!, out[a]!];
  return out;
}

/** Merge step i with i+1: keep the first action, combine the texts, span both source ranges. */
function merge(steps: Step[], i: number): Step[] {
  const a = steps[i]!;
  const b = steps[i + 1]!;
  const merged: Step = {
    ...a,
    instruction_he: `${a.instruction_he} ${b.instruction_he}`.trim(),
    what_user_sees_after: b.what_user_sees_after || a.what_user_sees_after,
    source: { ...a.source, end_time: b.source.end_time, frame_after: b.source.frame_after },
    screen: a.screen && b.screen ? { ...a.screen, after: b.screen.after ?? b.screen.before } : a.screen,
    confidence: Math.min(a.confidence, b.confidence),
    review: { status: "edited", notes: `merged ${a.id} + ${b.id}`, reviewed_at: now() },
  };
  return [...steps.slice(0, i), merged, ...steps.slice(i + 2)];
}

function Btn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`rounded-md border px-2 py-1 font-semibold disabled:opacity-30 ${danger ? "border-rose-200 text-rose-700" : "border-slate-200"}`}>
      {children}
    </button>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Frame({ label, src, time }: { label: string; src: string | null; time: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-500">
        {label} · <span className="ltr">{time.toFixed(1)}s</span>
      </span>
      {src ? <img src={src} alt={label} className="max-h-96 w-full rounded-lg border object-contain" /> : <div className="flex h-48 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">אין פריים</div>}
    </div>
  );
}
