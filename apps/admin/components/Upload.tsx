"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function Upload() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
        if (!input.files?.[0]) return;
        setBusy(true);
        const fd = new FormData();
        fd.append("file", input.files[0]);
        const res = await fetch("/api/projects", { method: "POST", body: fd });
        const j = await res.json();
        setBusy(false);
        setMsg(res.ok ? `הועלה: ${j.file} — העיבוד התחיל` : j.error);
        setTimeout(() => router.refresh(), 4000);
      }}
    >
      <input name="file" type="file" accept="video/mp4,video/quicktime,video/webm" className="text-sm" />
      <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "מעלה…" : "העלאה ועיבוד"}
      </button>
      {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
    </form>
  );
}
