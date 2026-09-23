import type { Script, Tutorial } from "@studio/shared";
import { isLatin, stepTitle } from "@studio/script-writer";

/**
 * Module 15 — written step-by-step guide (Markdown). YAML front matter makes
 * every guide machine-readable so the Academy engine can later merge dozens
 * of them into a book/course.
 */
export interface GuideOptions {
  projectId: string;
  script?: Script | null;
}

const bold = (label: string) => (label ? `**${label}**` : "");

/** Emphasise the real UI label inside a Hebrew sentence: 'Settings' → **Settings**. */
function emphasize(text: string, label: string): string {
  if (!label) return text;
  const quoted = `'${label}'`;
  if (text.includes(quoted)) return text.replace(quoted, bold(label));
  return text;
}

export function generateGuide(tutorial: Tutorial, opts: GuideOptions): string {
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const fm = [
    "---",
    `id: ${opts.projectId}`,
    `title: "${tutorial.title_he.replace(/"/g, "'")}"`,
    `title_en: "${tutorial.title.replace(/"/g, "'")}"`,
    `app: "${tutorial.app.name}"`,
    `language: he`,
    `difficulty: ${tutorial.difficulty}`,
    `steps: ${steps.length}`,
    `tags: [${tutorial.topic_tags.map((t) => `"${t}"`).join(", ")}]`,
    `fidelity: ${tutorial.fidelity_mode}`,
    "---",
    "",
  ];
  const lines: string[] = [...fm, `# ${tutorial.title_he}`, ""];
  lines.push("## מה עושים כאן", "");
  lines.push(`במדריך הזה נראה ${tutorial.title_he.replace(/^איך /, "איך ")} ב-${tutorial.app.name}, ב-${steps.length === 1 ? "שלב אחד" : `${steps.length} שלבים`} קצרים.`);
  if (tutorial.prerequisites.length) {
    lines.push("", "**מה צריך לפני שמתחילים:**", ...tutorial.prerequisites.map((p) => `- ${p}`));
  }
  lines.push("");

  for (const [i, s] of steps.entries()) {
    const label = s.action.required_real_label;
    const he = s.action.label_he && isLatin(label) ? ` (${s.action.label_he})` : "";
    lines.push(`## שלב ${i + 1}: ${stepTitle(s)}`, "");
    lines.push(`**מה עושים:** ${emphasize(s.instruction_he, label)}${he && !s.instruction_he.includes(s.action.label_he ?? "@@") ? he : ""}`, "");
    if (s.what_user_sees_after) lines.push(`**מה תראו:** ${s.what_user_sees_after.replace(/[.]?$/, ".")}`, "");
    if (s.warning) lines.push(`> ⚠️ **שימו לב:** ${s.warning}`, "");
    if (s.tip) lines.push(`> 💡 **טיפ:** ${s.tip}`, "");
    if (s.review.status === "needs_review") lines.push(`<!-- NEEDS REVIEW: confidence ${s.confidence.toFixed(2)}${s.review.notes ? ` — ${s.review.notes}` : ""} -->`, "");
  }

  lines.push("## חשוב לדעת", "");
  const notes = [...tutorial.important_notes];
  const labels = steps.map((s) => s.action.required_real_label).filter((l) => l && isLatin(l));
  if (labels.length) notes.push(`שמות הכפתורים והתפריטים מופיעים כאן בדיוק כמו במערכת (${[...new Set(labels)].map((l) => `'${l}'`).join(", ")}), כדי שיהיה קל למצוא אותם.`);
  notes.push("הנתונים שמופיעים בסרטון ובצילומים הם נתוני דוגמה בלבד.");
  lines.push(...notes.map((n) => `- ${n}`), "");

  lines.push("## אם זה לא מופיע אצלכם", "");
  const trouble = tutorial.troubleshooting.length
    ? tutorial.troubleshooting
    : ["ייתכן שהממשק עודכן מאז שהמדריך נוצר — חפשו את אותם שמות בתפריט הראשי או בהגדרות.", "ודאו שיש לחשבון שלכם הרשאות מתאימות."];
  lines.push(...trouble.map((t) => `- ${t}`), "");

  lines.push("## סיכום", "");
  lines.push(...steps.map((s, i) => `${i + 1}. ${stepTitle(s)}`), "");
  if (opts.script) {
    const hook = opts.script.hooks.find((h) => h.id === opts.script!.selectedHookId);
    if (hook) lines.push(`_${hook.text}_`, "");
  }
  return lines.join("\n");
}
