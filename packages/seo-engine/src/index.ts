import { SeoContent, type Tutorial } from "@studio/shared";
import { stepTitle } from "@studio/script-writer";

/**
 * Module 17 — SEO content for every Short. Built only from the tutorial
 * itself; no invented search volume, rankings, CTR or traffic.
 */
export const NO_DATA_NOTE =
  "אין נתוני חיפוש אמיתיים: לא חוברו Google Search Console או כלי מחקר מילות מפתח. נפח חיפוש, דירוג, CTR ותנועה לא הומצאו ומסומנים כ-null.";

export function generateSeo(tutorial: Tutorial, opts: { ctaText: string; channelName: string }): SeoContent {
  const app = tutorial.app.name;
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const title = tutorial.title_he;
  const labels = [...new Set(steps.map((s) => s.action.required_real_label).filter(Boolean))];
  const primary = title.includes(app) ? title : `${title} ב-${app}`;
  const stepLines = steps.map((s, i) => `${i + 1}. ${stepTitle(s)}`);
  const appTag = app.replace(/\s+/g, "");
  const hashtags = [`#${appTag}`, "#מדריך", "#טיפים", "#shorts"];
  const ytTitle = `${primary} | מדריך קצר`.slice(0, 95);
  return SeoContent.parse({
    topic: tutorial.title,
    search_intent: "informational",
    primary_query_he: primary,
    related_queries_he: [
      `${app} ${labels[0] ?? ""}`.trim(),
      `איפה ${labels.slice(-1)[0] ?? "ההגדרה"} ב-${app}`,
      `${app} מדריך בעברית`,
      ...labels.slice(1, 3).map((l) => `${l} ${app}`),
    ].filter((q, i, a) => q && a.indexOf(q) === i),
    youtube: {
      title: ytTitle,
      description: [`${primary} — ב-${steps.length} שלבים קצרים.`, "", ...stepLines, "", opts.ctaText, "", hashtags.join(" ")].join("\n"),
      tags: [app, `${app} מדריך`, "מדריך", "הדרכה", ...labels].slice(0, 15),
    },
    short_caption: `${primary} ב-${steps.length} שלבים 👇`,
    instagram_caption: `${primary}? ככה עושים את זה ב-${steps.length} שלבים:\n${stepLines.join("\n")}\n\nשמרו את הפוסט לפעם הבאה 📌\n${hashtags.join(" ")}`,
    tiktok_caption: `${primary} בפחות מדקה ${hashtags.slice(0, 3).join(" ")}`,
    hashtags,
    article_angle: `מדריך צעד-אחר-צעד עם צילומי מסך: ${primary}, כולל מה עושים אם האפשרות לא מופיעה.`,
    faq: [
      { q: `${primary}?`, a: `${steps.map((s) => s.instruction_he.replace(/\.$/, "")).join(", ואז ")}.` },
      ...(tutorial.troubleshooting[0] ? [{ q: `מה עושים אם האפשרות לא מופיעה ב-${app}?`, a: tutorial.troubleshooting[0] }] : []),
      { q: `כמה זמן זה לוקח?`, a: `פחות מדקה — ${steps.length === 1 ? "שלב אחד" : `${steps.length} שלבים`}.` },
    ],
    suggested_page_section: `${app} › מדריכים › ${labels[0] ?? tutorial.title}`,
    cta: opts.ctaText,
    related_topics: labels.map((l) => `${app}: ${l}`).slice(0, 5),
    data: { search_volume: null, ranking: null, ctr: null, traffic: null, note: NO_DATA_NOTE },
    generated_by: "template",
  });
}
