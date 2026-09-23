import type { SensitiveFinding, SensitiveKind } from "@studio/shared";

/**
 * Modules 9 + 22 — privacy detection and alternative demo data.
 *
 * Anything that identifies a person, account or secret is detected and
 * replaced with deterministic dummy data (same original → same replacement,
 * so a name stays consistent across screens). Real UI labels the viewer must
 * find are protected and never replaced.
 */

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const PATTERNS: { kind: SensitiveKind; re: RegExp }[] = [
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "api_key", re: /\b(?:sk|pk|rk|ghp|gho|xox[abp]|AKIA|AIza)[-_A-Za-z0-9]{12,}\b/g },
  { kind: "token", re: /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{40,}={0,2})\b/g },
  { kind: "account_id", re: /\b(?:[A-Z]{2,5}[-_]?\d{3,}(?:[-_]\d{3,})*|\d{4,}[-_]\d{3,}(?:[-_]\d{2,})*)\b/g },
  { kind: "payment_card", re: /\b(?:\d[ -]?){13,19}\b/g },
  { kind: "phone", re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{3,4}\b/g },
  { kind: "url", re: /\bhttps?:\/\/[^\s]+|\b(?:www\.)[^\s]+/g },
  { kind: "money", re: /(?:[$€£₪]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|ILS|₪|ש"ח))/g },
  { kind: "address", re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive)\b\.?/g },
];

const PASSWORD_CONTEXT = /(password|passcode|secret|api key|token|סיסמה)\s*[:=]\s*(\S+)/gi;

/** Common UI vocabulary: two capitalized words made of these are UI, not a person. */
const UI_WORDS = new Set(
  (
    "home dashboard settings account profile billing team teams member members invite send save cancel delete edit new add create open close " +
    "search filter sort export import upload download share help support log out logout sign in up security privacy notifications general " +
    "overview reports report analytics projects project tasks task calendar messages inbox users user roles role admin editor viewer owner " +
    "payment payments plan plans subscription integrations apps app workspace workspaces organization details preferences appearance theme " +
    "language email address name password phone status active inactive pending more options manage view all recent open tasks revenue sales " +
    "orders customers products product store campaign campaigns website refresh launch marketing planning spring summer q1 q2 q3 q4 two factor " +
    "authentication welcome back good morning afternoon evening first last next previous continue done finish submit apply enable disable " +
    "turn on off yes no ok learn more get started upgrade free trial pro basic premium business personal public private draft published " +
    "archive archived trash files file folder folders documents document media images image video videos settings general menu item items " +
    "select choose type enter click tap page pages section sections tab tabs button link links icon icons card cards table list grid"
  ).split(/\s+/),
);

export function looksLikePersonName(text: string, protectedLabels: Set<string> = new Set()): boolean {
  const t = text.trim();
  if (protectedLabels.has(t.toLowerCase())) return false;
  const m = /^([A-Z][a-z]{1,15})(?:\s+([A-Z]\.?|[A-Z][a-z]{1,15}))?\s+([A-Z][a-z]{1,20}(?:-[A-Z][a-z]+)?)$/.exec(t);
  if (!m) return false;
  const words = t.split(/\s+/).map((w) => w.toLowerCase().replace(/\.$/, ""));
  if (words.some((w) => UI_WORDS.has(w))) return false;
  return FIRST_NAMES.has(words[0]!) || words.length >= 2;
}

const BUSINESS_SUFFIX = /\b(?:Inc|LLC|Ltd|Corp|Co|GmbH|Group|Agency|Marketing|Studio|Studios|Labs|Media|Solutions|Consulting|Partners|Holdings|Industries|Technologies)\b\.?$/;

export function looksLikeBusinessName(text: string): boolean {
  return /^[A-Z][\w&'.-]*(?:\s+[A-Z&][\w&'.-]*){0,3}$/.test(text.trim()) && BUSINESS_SUFFIX.test(text.trim());
}

/** Find sensitive strings in a piece of text (OCR line, transcript sentence, ...). */
export function detectSensitive(text: string, opts: { protectedLabels?: Set<string>; frameId?: string } = {}): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      if (kind === "payment_card" && !luhn(m[0].replace(/\D/g, ""))) continue;
      if (kind === "phone" && m[0].replace(/\D/g, "").length < 9) continue;
      taken.push([start, end]);
      findings.push({ kind, text: m[0].trim(), frameId: opts.frameId });
    }
  }
  for (const m of text.matchAll(PASSWORD_CONTEXT)) findings.push({ kind: "password", text: m[2]!, frameId: opts.frameId });
  // Person names: check whole text and comma/pipe separated parts.
  for (const part of text.split(/\s*[,|•·]\s*|\s{2,}/)) {
    if (looksLikePersonName(part, opts.protectedLabels)) findings.push({ kind: "person_name", text: part.trim(), frameId: opts.frameId });
    else if (looksLikeBusinessName(part)) findings.push({ kind: "person_name", text: part.trim(), frameId: opts.frameId });
  }
  return findings;
}

function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Replacement
// ---------------------------------------------------------------------------

const FIRST = ["Daniel", "Noa", "Alex", "Maya", "Liam", "Emma", "Omer", "Tamar", "Ethan", "Yael", "Ben", "Lior", "Nina", "Adam", "Shira", "Ron"];
const LAST = ["Green", "Park", "Rivera", "Stone", "Brooks", "Hart", "Levin", "Carter", "Shaw", "Bloom", "Frost", "Lane", "Reed", "Hale", "Cole", "West"];
const FIRST_NAMES = new Set(
  "john jane michael maria kevin sarah david james robert mary linda william richard joseph thomas charles chris christopher daniel matthew anthony mark paul steven andrew joshua emily jessica ashley amanda anna laura lisa karen nancy betty helen sandra donna carol ruth sharon michelle kimberly deborah rachel peter george edward brian ryan jason eric jacob gary nicholas jonathan justin scott brandon frank benjamin samuel gregory alexander patrick jack dennis tyler aaron jose adam henry nathan zachary kyle noah ethan liam olivia sophia isabella mia charlotte amelia harper evelyn abigail ella avi yossi moshe david dana noa maya yael tamar shira"
    .split(" "),
);
const BUSINESSES = ["Bright Studio", "Northwind Labs", "Blue Harbor Co", "Maple & Oak", "Sunline Media", "Pinecrest Group", "Cobalt Works", "Juniper Supply"];

function seeded(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Keep the shape of a number but change its digits (42,718 → 31,460). */
export function perturbNumber(num: string, seed: number): string {
  let s = seed || 1;
  let first = true;
  const out = num.replace(/\d/g, (d) => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    let nd = (s >> 8) % 10;
    if (first) {
      nd = ((Number(d) + 1 + (nd % 7)) % 9) + 1; // non-zero, different leading digit
      first = false;
    }
    return String(nd);
  });
  return out === num ? num.replace(/\d(?!.*\d)/, (d) => String((Number(d) + 3) % 10)) : out;
}

export interface Substitution {
  kind: string;
  original: string;
  replacement: string;
}

/**
 * Deterministic replacer shared across a project. `protect` holds real UI
 * labels (menu names, buttons) that must stay exactly as in the product.
 */
export class DemoDataReplacer {
  private readonly map = new Map<string, Substitution>();
  private readonly protectedLabels: Set<string>;
  private nameIndex = 0;
  private bizIndex = 0;

  constructor(protect: Iterable<string> = [], private readonly salt = "studio") {
    this.protectedLabels = new Set([...protect].map((p) => p.toLowerCase().trim()).filter(Boolean));
  }

  get substitutions(): Substitution[] {
    return [...this.map.values()];
  }

  isProtected(text: string): boolean {
    return this.protectedLabels.has(text.toLowerCase().trim());
  }

  private remember(kind: string, original: string, make: () => string): string {
    const key = `${kind}:${original}`;
    const hit = this.map.get(key);
    if (hit) return hit.replacement;
    const replacement = make();
    this.map.set(key, { kind, original, replacement });
    return replacement;
  }

  personName(original: string): string {
    return this.remember("person_name", original, () => {
      const seed = seeded(this.salt + original);
      const i = (seed + this.nameIndex++) % FIRST.length;
      const j = (seed >> 5) % LAST.length;
      return `${FIRST[i]} ${LAST[j]}`;
    });
  }

  businessName(original: string): string {
    return this.remember("business", original, () => BUSINESSES[(seeded(this.salt + original) + this.bizIndex++) % BUSINESSES.length]!);
  }

  email(original: string): string {
    return this.remember("email", original, () => {
      const local = original.split("@")[0] ?? "user";
      // If the local part looks like a name we already replaced, keep them consistent.
      const parts = local.split(/[._-]/).filter(Boolean);
      for (const sub of this.map.values()) {
        if (sub.kind !== "person_name") continue;
        const [f, l] = sub.original.toLowerCase().split(/\s+/);
        if (f && parts[0]?.toLowerCase() === f && (!parts[1] || parts[1].toLowerCase() === l || parts[1].toLowerCase() === l?.[0])) {
          const [rf, rl] = sub.replacement.toLowerCase().split(" ");
          return `${rf}.${rl}@example.com`;
        }
      }
      if (parts.length >= 2 && /^[a-z]+$/i.test(parts[0]!) && /^[a-z]+$/i.test(parts[1]!)) {
        const fake = this.personName(`${cap(parts[0]!)} ${cap(parts[1]!)}`).toLowerCase().split(" ");
        return `${fake[0]}.${fake[1]}@example.com`;
      }
      return `user${(seeded(this.salt + original) % 90) + 10}@example.com`;
    });
  }

  replaceFinding(kind: SensitiveKind, original: string): string {
    if (this.isProtected(original)) return original;
    const seed = seeded(this.salt + kind + original);
    switch (kind) {
      case "email":
        return this.email(original);
      case "person_name":
        return looksLikeBusinessName(original) ? this.businessName(original) : this.personName(original);
      case "phone":
        return this.remember("phone", original, () => `(555) 01${seed % 10}-${String(1000 + (seed % 9000)).slice(0, 4)}`);
      case "payment_card":
        return this.remember("card", original, () => `•••• •••• •••• ${String(1000 + (seed % 9000))}`);
      case "api_key":
      case "token":
      case "password":
        return this.remember(kind, original, () => "••••••••••••");
      case "account_id":
        return this.remember("account_id", original, () => original.replace(/\d/g, (d, i: number) => String((Number(d) + 3 + i + (seed % 5)) % 10)));
      case "url":
        return this.remember("url", original, () => "https://example.com");
      case "address":
        return this.remember("address", original, () => "12 Example Street");
      case "money":
      case "number":
        return this.remember(kind, original, () => perturbNumber(original, seed));
    }
  }

  /** Replace every sensitive span in a text. Protected labels are left untouched. */
  scrub(text: string): string {
    if (!text || this.isProtected(text)) return text;
    let out = text;
    // Longest first so names inside emails are handled by the email rule.
    const findings = detectSensitive(text, { protectedLabels: this.protectedLabels }).sort((a, b) => b.text.length - a.text.length);
    for (const f of findings) {
      if (!out.includes(f.text)) continue;
      out = out.split(f.text).join(this.replaceFinding(f.kind, f.text));
    }
    return out;
  }

  /** Numbers in metric/value positions (not labels): 42,718 → 31,460. */
  scrubNumber(text: string): string {
    if (this.isProtected(text)) return text;
    return text.replace(/\d[\d,.]*/g, (n) => this.remember("number", n, () => perturbNumber(n, seeded(this.salt + n))));
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Deep-scrub every string inside a JSON-like value except keys listed in `skipKeys`. */
export function scrubDeep<T>(value: T, replacer: DemoDataReplacer, skipKeys: Set<string> = new Set(["id", "kind", "type", "icon", "variant", "anchor", "placement", "target", "screenId", "layout", "frame", "direction", "tone", "trend"])): T {
  const walk = (v: unknown, key: string | null): unknown => {
    if (typeof v === "string") return key && skipKeys.has(key) ? v : replacer.scrub(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value, null) as T;
}
