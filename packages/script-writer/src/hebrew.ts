import type { TutorialStep } from "@studio/shared";

/** Hebrew copy helpers for short-form tutorial narration (Module 7). */

const LATIN = /[A-Za-z]/;

export function isLatin(text: string): boolean {
  return LATIN.test(text);
}

/** The label the viewer should look for, quoted when it is a real UI string. */
export function spokenLabel(step: TutorialStep): string {
  const real = step.action.required_real_label || step.action.target_label;
  if (step.action.target_type === "icon" && step.action.label_he) return step.action.label_he;
  if (isLatin(real)) return `'${real}'`;
  return real;
}

/** Short title for the top bar, e.g. "לוחצים על Settings". */
export function stepTitle(step: TutorialStep): string {
  const real = step.action.required_real_label || step.action.target_label;
  const useHe = step.action.target_type === "icon" || real.length > 24 || !real;
  const label = useHe ? step.action.label_he ?? real : real;
  switch (step.action.type) {
    case "toggle":
    case "check":
      return `מפעילים את ${label}`;
    case "type":
      return `ממלאים את ${label}`;
    case "select":
      return step.action.value ? `בוחרים ${step.action.value}` : `בוחרים ב-${label}`;
    case "scroll":
      return "גוללים למטה";
    case "open_menu":
      return `פותחים את ${label}`;
    case "hover":
      return `מעבירים את העכבר על ${label}`;
    case "observe":
      return label;
    default:
      return step.action.target_type === "tab" ? `לשונית ${label}` : `לוחצים על ${label}`;
  }
}

/** Imperative (plural) instruction generated from the action, used when no human instruction exists. */
export function instructionFromAction(step: TutorialStep): string {
  const label = spokenLabel(step);
  const where = hebrewLocation(step.action.location_description);
  const w = where ? ` ${where}` : "";
  switch (step.action.type) {
    case "toggle":
    case "check":
      return `הפעילו את ${label}${w}.`;
    case "type": {
      // Emails / long values are shown on screen, not read aloud.
      const v = step.action.value;
      if (v && v.length <= 18 && !v.includes("@")) return `הקלידו '${v}' בשדה ${label}${w}.`;
      if (v && v.includes("@")) return `הקלידו את כתובת האימייל בשדה ${label}${w}.`;
      return `מלאו את השדה ${label}${w}.`;
    }
    case "select":
      return step.action.value ? `בחרו '${step.action.value}' ברשימה ${label}${w}.` : `בחרו אפשרות ברשימה ${label}${w}.`;
    case "scroll":
      return "גללו למטה בעמוד.";
    case "hover":
      return `העבירו את העכבר על ${label}${w}.`;
    case "double_click":
      return `לחצו לחיצה כפולה על ${label}${w}.`;
    case "right_click":
      return `לחצו לחיצה ימנית על ${label}${w}.`;
    case "observe":
      return `שימו לב ל-${label}${w}.`;
    default:
      return `לחצו על ${label}${w}.`;
  }
}

const LOCATION_WORDS: [RegExp, string][] = [
  [/top[- ]?right|upper right/i, "בפינה הימנית העליונה"],
  [/top[- ]?left|upper left/i, "בפינה השמאלית העליונה"],
  [/bottom[- ]?right|lower right/i, "בפינה הימנית התחתונה"],
  [/bottom[- ]?left|lower left/i, "בפינה השמאלית התחתונה"],
  [/left (side)?bar|left (menu|panel|sidebar)|sidebar.*left/i, "בתפריט הצד משמאל"],
  [/right (side)?bar|right (menu|panel|sidebar)/i, "בתפריט הצד מימין"],
  [/sidebar|side menu|navigation/i, "בתפריט הצד"],
  [/account menu|user menu|profile menu/i, "בתפריט החשבון"],
  [/dropdown|menu/i, "בתפריט שנפתח"],
  [/tabs?( row)?/i, "בשורת הלשוניות"],
  [/dialog|modal|popup|pop-up/i, "בחלון שנפתח"],
  [/top bar|toolbar|header|top of/i, "בסרגל העליון"],
  [/bottom|footer/i, "בתחתית המסך"],
  [/right/i, "בצד ימין"],
  [/left/i, "בצד שמאל"],
];

/** Map an English location description to natural Hebrew ("left sidebar" → "בתפריט הצד משמאל"). */
export function hebrewLocation(desc: string | null | undefined): string | null {
  if (!desc) return null;
  if (/[֐-׿]/.test(desc)) return desc;
  for (const [re, he] of LOCATION_WORDS) if (re.test(desc)) return he;
  return null;
}

const WHERE_HINTS = /(בצד|בפינה|בתפריט|בראש|בתחתית|בלשונית|לשונית|למעלה|למטה|מימין|משמאל|ימין|שמאל|בחלון|בסרגל|בשורת|בשדה|ברשימה|בעמוד|במסך|בכרטיס|בחלק)/;
const WHAT_HINTS = /(לחצו|בחרו|הפעילו|כבו|הקלידו|מלאו|גללו|פתחו|עברו|סמנו|העבירו|שימו לב|היכנסו|הוסיפו|שמרו|גררו|אשרו)/;

export interface StepCheck {
  stepId: string;
  what: boolean;
  where: boolean;
  after: boolean;
  issues: string[];
}

/** Every step must answer: what to do, where, and what you'll see after (Module 7). */
export function checkStep(step: TutorialStep, narration: string): StepCheck {
  const issues: string[] = [];
  const what = WHAT_HINTS.test(narration);
  // A named menu/tab/dialog item counts as "where" when the action happens inside it.
  const where = WHERE_HINTS.test(narration) || /menu_item|tab|dialog_button|option/.test(step.action.target_type);
  const after = Boolean(step.what_user_sees_after && step.what_user_sees_after.trim().length > 2);
  if (!what) issues.push("instruction has no clear action verb");
  if (!where) issues.push("instruction does not say where the element is");
  if (!after) issues.push("missing what the user sees after the action");
  if (narration.length > 170) issues.push("narration is long for a short video");
  return { stepId: step.id, what, where, after, issues };
}
