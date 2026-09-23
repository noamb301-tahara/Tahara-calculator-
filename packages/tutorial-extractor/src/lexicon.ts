/**
 * Tiny English→Hebrew lexicon for UI labels and tutorial titles, used only by
 * the offline (no-LLM) path. Unknown labels stay untranslated — the real
 * English label is always what the viewer searches for anyway.
 */

export const UI_LABELS_HE: Record<string, string> = {
  settings: "הגדרות", profile: "פרופיל", billing: "חיוב", team: "צוות", teams: "צוותים", security: "אבטחה", notifications: "התראות",
  save: "שמירה", "save changes": "שמירת שינויים", cancel: "ביטול", send: "שליחה", delete: "מחיקה", remove: "הסרה", edit: "עריכה",
  "email address": "כתובת אימייל", email: "אימייל", role: "תפקיד", editor: "עורך", admin: "מנהל", viewer: "צופה", owner: "בעלים",
  dashboard: "לוח בקרה", home: "דף הבית", projects: "פרויקטים", project: "פרויקט", calendar: "יומן", account: "חשבון", password: "סיסמה",
  search: "חיפוש", help: "עזרה", "help center": "מרכז העזרה", "log out": "התנתקות", logout: "התנתקות", "sign in": "התחברות", "sign out": "התנתקות",
  invite: "הזמנה", "invite member": "הזמנת חבר צוות", "invite members": "הזמנת חברי צוות", "send invite": "שליחת ההזמנה", "send invitation": "שליחת ההזמנה",
  add: "הוספה", new: "חדש", create: "יצירה", share: "שיתוף", export: "ייצוא", import: "ייבוא", upload: "העלאה", download: "הורדה",
  members: "חברים", users: "משתמשים", language: "שפה", general: "כללי", privacy: "פרטיות", integrations: "אינטגרציות", reports: "דוחות",
  analytics: "אנליטיקה", messages: "הודעות", inbox: "תיבת דואר", files: "קבצים", documents: "מסמכים", preferences: "העדפות",
  appearance: "מראה", "email notifications": "התראות במייל", "weekly summary": "סיכום שבועי", theme: "ערכת נושא", "two-factor authentication": "אימות דו-שלבי", "dark mode": "מצב כהה", continue: "המשך",
  next: "הבא", back: "חזרה", done: "סיום", submit: "שליחה", apply: "החלה", confirm: "אישור", close: "סגירה", menu: "תפריט",
  "profile picture": "תמונת הפרופיל", "new project": "פרויקט חדש", "add member": "הוספת חבר צוות", name: "שם", "full name": "שם מלא",
};

export function labelHe(label: string): string | null {
  return UI_LABELS_HE[label.trim().toLowerCase()] ?? null;
}

const VERBS_HE: Record<string, string> = {
  invite: "להזמין", add: "להוסיף", enable: "להפעיל", "turn on": "להפעיל", activate: "להפעיל", disable: "לכבות", "turn off": "לכבות",
  change: "לשנות", update: "לעדכן", edit: "לערוך", create: "ליצור", make: "ליצור", delete: "למחוק", remove: "להסיר", connect: "לחבר",
  export: "לייצא", import: "לייבא", share: "לשתף", reset: "לאפס", "set up": "להגדיר", setup: "להגדיר", configure: "להגדיר", find: "למצוא",
  upload: "להעלות", download: "להוריד", schedule: "לתזמן", send: "לשלוח", rename: "לשנות שם של", move: "להעביר", archive: "להעביר לארכיון",
  hide: "להסתיר", stop: "לעצור", mute: "להשתיק", unsubscribe: "לבטל הרשמה ל", show: "להציג", open: "לפתוח", install: "להתקין", use: "להשתמש ב", switch: "להחליף", cancel: "לבטל",
};

const NOUNS_HE: Record<string, string> = {
  teammate: "חבר צוות", "team member": "חבר צוות", member: "חבר צוות", user: "משתמש", users: "משתמשים", password: "סיסמה",
  "two-factor authentication": "אימות דו-שלבי", "2fa": "אימות דו-שלבי", account: "חשבון", notifications: "התראות", email: "אימייל",
  project: "פרויקט", file: "קובץ", folder: "תיקייה", invoice: "חשבונית", report: "דוח", page: "עמוד", language: "שפה", "dark mode": "מצב כהה",
  "profile picture": "תמונת פרופיל", photo: "תמונה", subscription: "מנוי", plan: "תוכנית", payment: "תשלום", "payment method": "אמצעי תשלום",
  meeting: "פגישה", event: "אירוע", task: "משימה", calendar: "יומן", signature: "חתימה", domain: "דומיין", website: "אתר", backup: "גיבוי",
  "email notifications": "התראות במייל", notification: "התראות", "push notifications": "התראות פוש",
  workspace: "סביבת עבודה", channel: "ערוץ", group: "קבוצה", contact: "איש קשר", contacts: "אנשי קשר", theme: "ערכת נושא",
};

/** "invite a teammate" → "איך להזמין חבר צוות". Returns null if not confidently translatable. */
export function titleHe(howTo: string, app: string | null): string | null {
  const t = howTo.trim().toLowerCase().replace(/[.!?]+$/, "");
  const verbs = Object.keys(VERBS_HE).sort((a, b) => b.length - a.length);
  const verb = verbs.find((v) => t === v || t.startsWith(v + " "));
  if (!verb) return null;
  let rest = t.slice(verb.length).trim().replace(/^(a|an|the|your|new)\s+/, "").replace(/\s+(in|on|with)\s+\w+$/, "").trim();
  const noun = NOUNS_HE[rest] ?? NOUNS_HE[rest.replace(/s$/, "")];
  if (!noun && rest) return null;
  rest = noun ?? "";
  void app;
  return `איך ${VERBS_HE[verb]}${rest ? ` ${rest}` : ""}`;
}
