import type { DetectedAction, TranscriptSegment } from "@studio/shared";

/**
 * Narration cue parsing: "click Team in the left sidebar" → { click, "Team", "left sidebar" }.
 * Handles several cues per sentence and "open the X menu and choose Y" → select.
 */

export interface Cue {
  action: DetectedAction["action"];
  verb: string;
  /** Target phrase candidates, most specific first. */
  targets: string[];
  location: string | null;
  value: string | null;
  /** Dropdown/menu the value belongs to (select). */
  container: string | null;
  time: number;
  windowStart: number;
  windowEnd: number;
  segmentId: string;
  sentence: string;
}

const VERBS: [RegExp, DetectedAction["action"]][] = [
  [/^(?:double[- ]click)$/i, "double_click"],
  [/^(?:click|tap|press|hit)(?: on)?$/i, "click"],
  [/^(?:select|choose|pick)$/i, "select"],
  [/^(?:open|expand)$/i, "open_menu"],
  [/^(?:go to|head to|navigate to|head over to|go over to|switch to)$/i, "navigate"],
  [/^(?:type|enter|fill in|paste|write)$/i, "type"],
  [/^(?:toggle|turn on|turn off|switch on|switch off|enable|disable|check|uncheck|tick)$/i, "toggle"],
  [/^(?:scroll(?: down| up)?)$/i, "scroll"],
  [/^(?:hover(?: over)?)$/i, "hover"],
  [/^(?:drag)$/i, "drag"],
];
const VERB_RE = /\b(double[- ]click|click(?: on)?|tap|press|hit|select|choose|pick|open|expand|go to|head to|navigate to|head over to|go over to|switch to|type|enter|fill in|paste|write|toggle|turn on|turn off|switch on|switch off|enable|disable|uncheck|check|tick|scroll(?: down| up)?|hover(?: over)?|drag)\b/gi;

const STOP = /\b(in|on|at|from|to|and|then|so|which|that|under|inside|near|next|below|above|of the|of your|for|with)\b|[,.;:!?]/i;
const LOCATION = /\b(?:in|on|at|from|under|inside)\s+(?:the\s+)?((?:top|bottom|upper|lower|left|right|side|main|account|user|profile|navigation|nav)?\s*(?:[\w-]+\s+){0,2}(?:sidebar|side bar|menu|corner|bar|toolbar|header|panel|tab|tabs|dialog|window|page|screen|section|top right|top left|bottom right|bottom left|right|left|top|bottom))\b/i;
const TYPE_WORDS = /\s+(button|menu|tab|link|icon|option|field|box|dropdown|toggle|switch|checkbox|item)$/i;

export function parseCues(segments: TranscriptSegment[]): Cue[] {
  const out: Cue[] = [];
  for (const seg of segments) {
    const sentence = seg.text;
    const matches = [...sentence.matchAll(VERB_RE)];
    const local: Cue[] = [];
    for (const [k, m] of matches.entries()) {
      const verb = m[0].toLowerCase();
      const action = VERBS.find(([re]) => re.test(verb))?.[1] ?? "click";
      const start = (m.index ?? 0) + m[0].length;
      const nextVerbAt = matches[k + 1]?.index ?? sentence.length;
      const tail = sentence.slice(start, nextVerbAt);
      const cut = tail.search(STOP);
      let phrase = (cut >= 0 ? tail.slice(0, cut) : tail).trim();
      phrase = phrase.replace(/^(?:the|a|an|your|our|this|that|on|into|in)\s+/i, "").replace(/^(?:the|a|an)\s+/i, "").trim();
      const kind = TYPE_WORDS.exec(phrase)?.[1]?.toLowerCase() ?? null;
      phrase = phrase.replace(TYPE_WORDS, "").trim();
      if (!phrase && action !== "scroll") continue;
      const locM = LOCATION.exec(tail);
      const frac = (m.index ?? 0) / Math.max(1, sentence.length);
      const time = seg.start + (seg.end - seg.start) * frac;
      // "your teammate's email address" → ["teammate's email address", "email address", "address"]
      const words = phrase.replace(/'s\b/g, "").split(/\s+/).filter(Boolean);
      const targets = [phrase, ...words.map((_, i) => words.slice(i).join(" ")).slice(1)].filter((t, i, a) => t && a.indexOf(t) === i);
      local.push({
        action: action === "open_menu" && kind !== "menu" && kind !== "dropdown" ? "click" : action,
        verb,
        targets,
        location: locM?.[1]?.trim() ?? null,
        value: null,
        container: null,
        time,
        windowStart: seg.start - 0.5,
        windowEnd: seg.end + 3,
        segmentId: seg.id,
        sentence,
      });
    }
    // "open the Role menu and choose Editor" → one select on Role with value Editor.
    for (let i = 0; i < local.length; i++) {
      const a = local[i]!;
      const b = local[i + 1];
      if (a.action === "open_menu" && b && b.action === "select") {
        local.splice(i, 2, { ...a, action: "select", value: b.targets[0] ?? null, container: a.targets[0] ?? null, windowEnd: b.windowEnd });
      } else if (a.action === "select") {
        a.value = a.targets[0] ?? null;
      }
    }
    out.push(...local);
  }
  return out;
}
