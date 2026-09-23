import { join } from "node:path";
import { PROJECT_FILES, ScreenSetSchema, Tutorial, normalizeLabel } from "@studio/shared";
import { ensureDir, exists, readJsonAs, writeFileAtomic, writeJson, type ProjectStore } from "@studio/shared/node";

/**
 * Module 16 — Academy engine (foundation). Reads every tutorial and derives
 * clusters, duplicates, gaps, ordering and outlines. It does not write a full
 * course yet — only the structure, by design.
 */

export interface AcademyTutorial {
  projectId: string;
  tutorial: Tutorial;
  /** Nav items seen in the reconstructed screens (for gap detection). */
  navLabels: string[];
}

const DIFFICULTY = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function tokens(t: Tutorial): Set<string> {
  const words = [t.title, ...t.topic_tags, ...t.steps.map((s) => s.action.required_real_label)].flatMap((x) => normalizeLabel(x).split(" "));
  return new Set(words.filter((w) => w.length > 2 && !["how", "the", "and", "your", "with"].includes(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 0;
}

export interface AcademyPlan {
  generatedAt: string;
  apps: {
    app: string;
    chapters: { title: string; tutorials: { projectId: string; title_he: string; difficulty: string; steps: number }[] }[];
    duplicates: { a: string; b: string; similarity: number }[];
    missingTopics: string[];
  }[];
}

export function planAcademy(items: AcademyTutorial[]): AcademyPlan {
  const byApp = new Map<string, AcademyTutorial[]>();
  for (const it of items) byApp.set(it.tutorial.app.name, [...(byApp.get(it.tutorial.app.name) ?? []), it]);
  const apps: AcademyPlan["apps"] = [];
  for (const [app, list] of byApp) {
    const toks = new Map(list.map((i) => [i.projectId, tokens(i.tutorial)]));
    const duplicates: AcademyPlan["apps"][number]["duplicates"] = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const s = jaccard(toks.get(list[i]!.projectId)!, toks.get(list[j]!.projectId)!);
        if (s >= 0.7) duplicates.push({ a: list[i]!.projectId, b: list[j]!.projectId, similarity: Math.round(s * 100) / 100 });
      }
    // Chapters: group by the first navigation target (the area of the product the tutorial lives in).
    const chapterOf = (t: Tutorial) => t.steps.find((s) => s.action.target_type === "sidebar_item" || s.action.target_type === "menu_item")?.action.required_real_label ?? t.steps[0]?.action.required_real_label ?? "General";
    const chapters = new Map<string, AcademyTutorial[]>();
    for (const it of list) chapters.set(chapterOf(it.tutorial), [...(chapters.get(chapterOf(it.tutorial)) ?? []), it]);
    const ordered = [...chapters.entries()]
      .map(([title, ts]) => ({
        title,
        tutorials: ts
          .sort((a, b) => DIFFICULTY[a.tutorial.difficulty] - DIFFICULTY[b.tutorial.difficulty] || a.tutorial.steps.length - b.tutorial.steps.length)
          .map((t) => ({ projectId: t.projectId, title_he: t.tutorial.title_he, difficulty: t.tutorial.difficulty, steps: t.tutorial.steps.length })),
      }))
      .sort((a, b) => Math.min(...a.tutorials.map((t) => DIFFICULTY[t.difficulty as keyof typeof DIFFICULTY])) - Math.min(...b.tutorials.map((t) => DIFFICULTY[t.difficulty as keyof typeof DIFFICULTY])));
    // Gaps: product areas visible in the UI that no tutorial walks through.
    const covered = new Set(list.flatMap((i) => i.tutorial.steps.map((s) => normalizeLabel(s.action.required_real_label))));
    const seen = new Set(list.flatMap((i) => i.navLabels));
    const missingTopics = [...seen].filter((l) => !covered.has(normalizeLabel(l))).sort();
    apps.push({ app, chapters: ordered, duplicates, missingTopics });
  }
  return { generatedAt: new Date().toISOString(), apps };
}

export function courseOutline(plan: AcademyPlan): string {
  const out = ["# מבנה קורס (טיוטה)", ""];
  for (const a of plan.apps) {
    out.push(`## ${a.app}`, "");
    a.chapters.forEach((c, i) => {
      out.push(`### פרק ${i + 1}: ${c.title}`);
      for (const t of c.tutorials) out.push(`- ${t.title_he} _(${t.difficulty}, ${t.steps} שלבים)_`);
      out.push("");
    });
    if (a.missingTopics.length) out.push("**נושאים שחסרים (מופיעים בממשק ואין עליהם מדריך):** " + a.missingTopics.join(", "), "");
    if (a.duplicates.length) out.push("**כפילויות אפשריות:** " + a.duplicates.map((d) => `${d.a} ≈ ${d.b} (${d.similarity})`).join("; "), "");
  }
  return out.join("\n");
}

export function presentationOutline(plan: AcademyPlan): string {
  const out = ["# מבנה מצגת (טיוטה)", ""];
  let n = 1;
  for (const a of plan.apps) {
    out.push(`## שקף ${n++}: ${a.app} — מה נלמד`, ...a.chapters.map((c) => `- ${c.title}`), "");
    for (const c of a.chapters) for (const t of c.tutorials) out.push(`## שקף ${n++}: ${t.title_he}`, `- ${t.steps} שלבים · ${t.difficulty}`, "");
  }
  return out.join("\n");
}

export async function buildAcademy(store: ProjectStore, outDir: string): Promise<{ tutorials: number; files: string[] }> {
  const items: AcademyTutorial[] = [];
  for (const p of await store.list()) {
    const tf = store.pathFor(p.id, PROJECT_FILES.tutorial);
    if (!(await exists(tf))) continue;
    const tutorial = await readJsonAs(tf, Tutorial);
    let navLabels: string[] = [];
    const sf = store.pathFor(p.id, PROJECT_FILES.screens);
    if (await exists(sf)) navLabels = [...new Set((await readJsonAs(sf, ScreenSetSchema)).screens.flatMap((s) => s.sidebar?.items.map((i) => i.label) ?? []))];
    items.push({ projectId: p.id, tutorial, navLabels });
  }
  const plan = planAcademy(items);
  await ensureDir(outDir);
  await writeJson(join(outDir, "academy.json"), plan);
  await writeFileAtomic(join(outDir, "course-outline.md"), courseOutline(plan));
  await writeFileAtomic(join(outDir, "presentation-outline.md"), presentationOutline(plan));
  await writeFileAtomic(join(outDir, "guide-outline.md"), courseOutline(plan).replace("מבנה קורס", "מבנה ספר מדריכים"));
  return { tutorials: items.length, files: ["academy.json", "course-outline.md", "presentation-outline.md", "guide-outline.md"] };
}
