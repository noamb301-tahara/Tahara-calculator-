import { existsSync } from "node:fs";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  FINAL_VIDEO_NAME,
  PROJECT_FILES,
  STAGE_ORDER,
  type FramesAnalysisResult,
  type IngestResult,
  type RenderPlan,
  type Script,
  type SeoContent,
  type SourceAnalysis,
  type Transcript,
  type Tutorial,
  type VoiceTrack,
} from "@studio/shared";
import { fileUrl, getConfig, getStore, outputDir, readProjectJson, readProjectText } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { RunControls } from "@/components/RunControls";
import { StepsReview } from "@/components/StepsReview";
import { ShortPlayer, StepPlayer } from "@/components/Preview";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["source", "SOURCE"],
  ["analysis", "ANALYSIS"],
  ["steps", "STEPS"],
  ["script", "SCRIPT"],
  ["demo", "DEMO UI"],
  ["voice", "VOICE"],
  ["render", "RENDER"],
  ["guide", "GUIDE"],
  ["seo", "SEO"],
] as const;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const project = await store.get(id);
  if (!project) notFound();
  const config = await getConfig();
  const [ingest, transcript, frames, analysis, tutorial, script, voice, plan, seo, guide] = await Promise.all([
    readProjectJson<IngestResult>(project, "media"),
    readProjectJson<Transcript>(project, "transcriptJson"),
    readProjectJson<FramesAnalysisResult>(project, "framesAnalysis"),
    readProjectJson<SourceAnalysis>(project, "sourceAnalysis"),
    readProjectJson<Tutorial>(project, "tutorial"),
    readProjectJson<Script>(project, "script"),
    readProjectJson<VoiceTrack>(project, "voiceMeta"),
    readProjectJson<RenderPlan>(project, "renderPlan"),
    readProjectJson<SeoContent>(project, "seo"),
    readProjectText(project, "guide"),
  ]);
  const hasFinal = existsSync(`${await outputDir()}/${id}/${FINAL_VIDEO_NAME}`);
  const frameUrl: Record<string, string> = {};
  for (const f of frames?.frames ?? []) frameUrl[f.file] = fileUrl(id, f.file);
  const playerPlan = plan ? { ...plan, audio: plan.audio ? { ...plan.audio, src: fileUrl(id, PROJECT_FILES.voiceTrack) } : null } : null;
  const needsReview = tutorial?.steps.filter((s) => s.review.status === "needs_review").length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-extrabold">{tutorial?.title_he ?? project.name}</h1>
        <StatusBadge status={project.status} />
        <span className="ltr text-sm text-slate-500">{project.id}</span>
        {project.error ? <span className="ltr rounded bg-rose-50 px-2 py-1 text-sm text-rose-700">{project.error}</span> : null}
      </div>
      <RunControls projectId={id} status={project.status} isManual={project.origin === "manual"} preset={project.settings.stylePreset ?? config.style.preset} fidelity={project.settings.fidelityMode ?? config.fidelity.mode} />
      <nav className="ltr sticky top-14 z-10 flex flex-wrap gap-2 rounded-xl bg-white/90 p-2 text-xs font-bold backdrop-blur">
        {SECTIONS.map(([k, label]) => (
          <a key={k} href={`#${k}`} className="rounded-md bg-slate-100 px-3 py-1.5 hover:bg-slate-200">
            {label}
          </a>
        ))}
      </nav>

      <Section id="source" title="SOURCE">
        {project.source ? (
          <div className="grid gap-6 md:grid-cols-[320px_1fr]">
            <video src={fileUrl(id, project.source.storedFile)} controls className="w-full rounded-xl bg-black" />
            <dl className="ltr grid grid-cols-2 gap-x-6 gap-y-2 self-start text-sm">
              <Dt k="file" v={project.source.filename} />
              <Dt k="sha256" v={project.source.sha256.slice(0, 16) + "…"} />
              {ingest ? (
                <>
                  <Dt k="duration" v={`${ingest.media.durationSec.toFixed(2)} s`} />
                  <Dt k="resolution" v={`${ingest.media.width}×${ingest.media.height} @ ${ingest.media.fps.toFixed(2)} fps`} />
                  <Dt k="codecs" v={`${ingest.media.videoCodec} / ${ingest.media.audioCodec ?? "no audio"}`} />
                  <Dt k="scene changes" v={ingest.scenes.map((s) => s.time.toFixed(1)).join(", ") || "—"} />
                </>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="text-slate-500">פרויקט ידני — הדרכה שנכתבה ביד, ללא סרטון מקור.</p>
        )}
      </Section>

      <Section id="analysis" title="ANALYSIS">
        <table className="ltr w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">stage</th>
              <th>status</th>
              <th>time</th>
              <th>provider</th>
              <th>cost</th>
              <th>notes</th>
            </tr>
          </thead>
          <tbody>
            {STAGE_ORDER.map((s) => {
              const r = project.stages[s];
              return (
                <tr key={s} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 font-semibold">{s}</td>
                  <td className={r?.status === "error" ? "text-rose-600" : r?.status === "complete" ? "text-emerald-700" : "text-slate-400"}>
                    {r?.status ?? "pending"}
                    {r?.cached ? " (cached)" : ""}
                  </td>
                  <td>{r?.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : ""}</td>
                  <td>{r?.provider ?? ""}</td>
                  <td>{r?.cost ? (r.cost.usd != null ? `$${r.cost.usd}` : Object.entries(r.cost.units).map(([k, v]) => `${v} ${k}`).join(", ")) : ""}</td>
                  <td className="max-w-md text-xs text-slate-500">{r?.error ?? r?.notes.slice(0, 3).join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transcript ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold">
              תמלול ({transcript.provider}, <span className="ltr">{transcript.language ?? "?"}</span>)
            </summary>
            <pre className="ltr mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{transcript.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`).join("\n")}</pre>
          </details>
        ) : null}
        {analysis ? (
          <div className="ltr mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {analysis.actions.map((a) => (
              <div key={a.id} className="rounded-lg bg-slate-50 p-2">
                <b>
                  {a.timestamp.toFixed(2)}s {a.action}
                </b>{" "}
                “{a.target}” · {a.confidence}
                <div className="text-slate-500">{a.signals.map((s) => s.signal).join(", ")}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section id="steps" title={`STEPS${needsReview ? ` · ${needsReview} NEEDS REVIEW` : ""}`}>
        {tutorial ? <StepsReview projectId={id} initial={tutorial} frameUrl={frameUrl} threshold={config.thresholds.stepReview} isManual={project.origin === "manual"} /> : <p className="text-slate-500">עוד אין שלבים — הריצו את הניתוח.</p>}
      </Section>

      <Section id="script" title="SCRIPT">
        {script ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              {script.segments.map((s) => (
                <div key={s.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="ltr text-xs font-bold text-slate-500">
                    {s.kind} {s.stepId ?? ""} · ~{s.estimatedSec.toFixed(1)}s
                  </div>
                  <div className="text-base">{s.text}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="font-bold">Hooks</h3>
              {script.hooks.map((h) => (
                <div key={h.id} className={`rounded-lg border p-3 ${h.id === script.selectedHookId ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
                  <span className="ltr text-xs text-slate-500">{h.style}</span>
                  <div>{h.text}</div>
                </div>
              ))}
              <h3 className="pt-3 font-bold">בדיקת איכות (מה / איפה / מה רואים אחרי)</h3>
              {script.checks.map((c) => (
                <div key={c.stepId} className="ltr text-xs">
                  {c.stepId}: {c.what ? "✓" : "✗"} what · {c.where ? "✓" : "✗"} where · {c.after ? "✓" : "✗"} after {c.issues.length ? `— ${c.issues.join(", ")}` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="demo" title="DEMO UI · מקור מול שחזור">
        {playerPlan && tutorial ? (
          <div className="space-y-6">
            {playerPlan.scenes
              .filter((s) => s.kind === "step")
              .map((scene) => {
                const step = tutorial.steps.find((s) => s.id === scene.step?.stepId);
                const src = step?.source.frame_before ? frameUrl[step.source.frame_before] : null;
                return (
                  <div key={scene.id} className="grid items-start gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
                    <div>
                      <div className="mb-1 text-xs font-bold text-slate-500">מה המקור לימד</div>
                      {src ? <img src={src} alt="" className="w-full rounded-xl border" /> : <div className="rounded-xl bg-slate-100 p-8 text-center text-xs text-slate-400">אין פריים מקור</div>}
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-bold text-slate-500">מה הסרטון החדש יציג</div>
                      <StepPlayer plan={playerPlan} sceneId={scene.id} />
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="text-lg font-bold">
                        שלב {scene.step?.index}: {scene.title}
                      </div>
                      <div>{step?.instruction_he}</div>
                      <div className="ltr text-xs text-slate-500">
                        real label: <b>{scene.step?.realLabel}</b> · actions: {scene.actions.map((a) => a.type).join(" → ")}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="voice" title="VOICE">
        {voice ? (
          <div className="space-y-2">
            <audio controls src={fileUrl(id, PROJECT_FILES.voiceTrack)} className="w-full" />
            <p className="ltr text-sm text-slate-500">
              provider: {voice.provider} {voice.voiceId ? `(${voice.voiceId})` : ""} · {voice.totalSec.toFixed(1)}s · {voice.segments.filter((s) => s.cached).length}/{voice.segments.length} segments from cache
            </p>
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="render" title="RENDER">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold text-slate-500">final-short.mp4</div>
            {hasFinal ? <video src={fileUrl(id, `@output/${FINAL_VIDEO_NAME}`)} controls className="w-full max-w-sm rounded-xl bg-black" /> : <Empty text="עוד לא רונדר" />}
          </div>
          <div>
            <div className="mb-1 text-xs font-bold text-slate-500">תצוגה חיה (אותו מנוע, בדפדפן)</div>
            {playerPlan ? (
              <div className="max-w-sm">
                <ShortPlayer plan={playerPlan} />
              </div>
            ) : (
              <Empty />
            )}
          </div>
        </div>
      </Section>

      <Section id="guide" title="GUIDE">
        {guide ? (
          <article className="prose max-w-none space-y-2 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ms-5 [&_li]:list-disc">
            <ReactMarkdown>{guide.replace(/^---[\s\S]*?---\n/, "")}</ReactMarkdown>
          </article>
        ) : (
          <Empty />
        )}
      </Section>

      <Section id="seo" title="SEO">
        {seo ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <div>
                <b>YouTube:</b> {seo.youtube.title}
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{seo.youtube.description}</pre>
              <div>
                <b>Instagram:</b> <pre className="whitespace-pre-wrap text-xs">{seo.instagram_caption}</pre>
              </div>
              <div>
                <b>TikTok:</b> {seo.tiktok_caption}
              </div>
              <div className="rounded bg-amber-50 p-2 text-xs text-amber-900">{seo.data.note}</div>
            </div>
            <pre className="ltr max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(seo, null, 2)}</pre>
          </div>
        ) : (
          <Empty />
        )}
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="ltr mb-4 text-sm font-extrabold tracking-widest text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Dt({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </>
  );
}

function Empty({ text = "עוד לא נוצר" }: { text?: string }) {
  return <p className="text-sm text-slate-400">{text}</p>;
}
