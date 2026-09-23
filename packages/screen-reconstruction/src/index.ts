import {
  ScreenDefinitionSchema,
  ScreenSetSchema,
  Tutorial,
  labelSimilarity,
  slugify,
  type BBox,
  type FidelityMode,
  type FrameAnalysis,
  type FramesAnalysisResult,
  type NavItem,
  type Overlay,
  type ScreenDefinition,
  type ScreenElement,
  type ScreenSet,
  type TutorialStep,
} from "@studio/shared";
import { DemoDataReplacer, detectSensitive, isDummy, scrubDeep } from "@studio/demo-data";
import { collectTargetIds } from "@studio/remotion-scenes/engine";
import { BUTTON_WORDS, buildAppModel, buildPage, cleanLabel, groupIntoCards, idFor, inside, isJunk, pageLines, unionOf, type AppModel } from "./builders";

export * from "./builders";

/**
 * Module 10 (screen reconstruction) — FAITHFUL STYLIZED RECONSTRUCTION.
 *
 * Keeps: real labels, menu names, hierarchy, order of actions, rough spatial
 * relations, what happens after each click. Changes: all visuals (from the
 * style preset), people, companies, numbers, emails, IDs (dummy data).
 */

export interface ReconstructInput {
  tutorial: Tutorial;
  frames: FramesAnalysisResult;
  fidelity: FidelityMode;
  /** Salt for deterministic dummy data. */
  salt?: string;
}

export interface ReconstructResult {
  screens: ScreenSet;
  tutorial: Tutorial;
  notes: string[];
}

interface DialogModel {
  id: string;
  title: string;
  body: ScreenElement[];
  actions: ScreenElement[];
  bbox: BBox;
}

interface State {
  page: FrameAnalysis;
  dialog: DialogModel | null;
  values: Record<string, string>;
  selections: Record<string, string>;
  toggles: Record<string, boolean>;
  toast: string | null;
  activeTab: string | null;
}

const frameByFile = (frames: FramesAnalysisResult, file: string | null) => (file ? frames.analyses.find((a) => a.file === file) ?? null : null);

function newLinesVs(after: FrameAnalysis, before: FrameAnalysis, region: BBox) {
  return after.ocr.lines.filter(
    (l) => !isJunk(l) && inside(l.bbox, region) && !before.ocr.lines.some((p) => labelSimilarity(p.text, l.text) > 0.85 && Math.abs(p.bbox.y - l.bbox.y) < 30 && Math.abs(p.bbox.x - l.bbox.x) < 40),
  );
}

/** Build a dialog from the lines that appeared when it opened. */
function buildDialog(after: FrameAnalysis, before: FrameAnalysis, app: AppModel, steps: TutorialStep[], frames: FramesAnalysisResult): DialogModel | null {
  const fresh = newLinesVs(after, before, app.region).filter((l) => l.bbox.x > app.region.x + 10);
  const textLines = fresh.filter((l) => l.source !== "control" && !/\b(sent|saved|success)\b/i.test(l.text));
  if (!textLines.length) return null;
  const titleLine = textLines.slice(0, 3).reduce((a, b) => (b.bbox.h > a.bbox.h * 1.1 ? b : a));
  const box = unionOf(fresh)!;
  const bbox = { x: box.x - 40, y: box.y - 40, w: box.w + 80, h: box.h + 80 };
  const title = cleanLabel(titleLine.text);
  const body: ScreenElement[] = [];
  const actions: ScreenElement[] = [];
  const rest = fresh.filter((l) => l !== titleLine).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const consumed = new Set<(typeof rest)[number]>();
  for (const l of rest) {
    if (consumed.has(l)) continue;
    const label = cleanLabel(l.text);
    if (l.source === "control" || (BUTTON_WORDS.test(label) && label.split(" ").length <= 3)) {
      actions.push({ kind: "button", id: idFor("btn", label), label, variant: l.source === "control" ? "primary" : "secondary" });
      continue;
    }
    const valueLine = rest.find((v) => v !== l && !consumed.has(v) && v.source !== "control" && v.bbox.y > l.bbox.y && v.bbox.y - (l.bbox.y + l.bbox.h) < 60 && Math.abs(v.bbox.x - l.bbox.x) < 45);
    const selectStep = steps.find((s) => s.action.type === "select" && labelSimilarity(s.action.required_real_label, label) > 0.8);
    const typeStep = steps.find((s) => s.action.type === "type" && labelSimilarity(s.action.required_real_label, label) > 0.8);
    if (selectStep) {
      const current = valueLine ? cleanLabel(valueLine.text) : selectStep.action.value ?? "—";
      if (valueLine) consumed.add(valueLine);
      const options = gatherOptions(frames, l.bbox, label, selectStep, current);
      body.push({ kind: "dropdown", id: idFor("dd", label), label, value: slugify(current, 30), options });
    } else if (typeStep || valueLine || /email|name|password|address|phone|title|url|search/i.test(label)) {
      if (valueLine) consumed.add(valueLine);
      // A field the tutorial types into starts empty (whatever OCR saw there was a placeholder or partial typing).
      body.push({
        kind: "input",
        id: idFor("input", label),
        label,
        placeholder: typeStep ? placeholderFor(label) : undefined,
        value: !typeStep && valueLine ? cleanLabel(valueLine.text) : undefined,
        inputType: /email/i.test(label) ? "email" : /password/i.test(label) ? "password" : "text",
      });
    } else {
      body.push({ kind: "text", text: label, variant: "muted" });
    }
  }
  return { id: idFor("dialog", title), title, body, actions, bbox };
}

function placeholderFor(label: string): string {
  if (/email/i.test(label)) return "name@example.com";
  if (/name/i.test(label)) return "Full name";
  if (/phone/i.test(label)) return "(555) 010-0000";
  return "";
}

/** Options of a dropdown: lines that appear under its label while the select step runs. */
function gatherOptions(frames: FramesAnalysisResult, labelBox: BBox, label: string, step: TutorialStep, current: string) {
  const seen = new Map<string, string>();
  const add = (t: string) => {
    const c = cleanLabel(t);
    if (c && labelSimilarity(c, label) < 0.8 && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  };
  add(current);
  for (const f of frames.analyses) {
    if (f.time < step.source.start_time - 0.5 || f.time > step.source.end_time + 1.5) continue;
    for (const l of f.ocr.lines) {
      if (l.bbox.y > labelBox.y + labelBox.h + 40 && l.bbox.y < labelBox.y + 380 && Math.abs(l.bbox.x - labelBox.x) < 50 && l.source !== "control" && l.text.split(" ").length <= 3) add(l.text);
    }
  }
  if (step.action.value) add(step.action.value);
  return [...seen.values()].map((l) => ({ id: slugify(l, 30), label: l }));
}

function renderScreen(state: State, app: AppModel, appName: string, counter: Map<string, number>): ScreenDefinition {
  const page = buildPage(pageLines(state.page, app, state.dialog?.bbox ?? null));
  // Initial toggle states come from the steps ("turn off X" ⇒ X starts on).
  const setToggles = (els: ScreenElement[]) => {
    for (const el of els) {
      if (el.kind === "setting_row" && el.control?.kind === "toggle" && state.toggles[el.control.id] !== undefined) el.control = { ...el.control, on: state.toggles[el.control.id]! };
      if ("children" in el && Array.isArray(el.children)) setToggles(el.children);
    }
  };
  setToggles(page.content);
  const title = page.title ?? state.page.pageTitle ?? appName;
  const apply = (els: ScreenElement[]): ScreenElement[] =>
    els.map((el) => {
      if (el.kind === "tabs" && state.activeTab) {
        const tab = el.tabs.find((t) => labelSimilarity(t.label, state.activeTab!) > 0.85);
        if (tab) return { ...el, active: tab.id };
      }
      if (el.kind === "input" && state.values[el.id] !== undefined) return { ...el, value: state.values[el.id] };
      if (el.kind === "dropdown" && state.selections[el.id]) return { ...el, value: state.selections[el.id]! };
      if (el.kind === "toggle" && state.toggles[el.id] !== undefined) return { ...el, on: state.toggles[el.id]! };
      if ("children" in el && Array.isArray(el.children)) return { ...el, children: apply(el.children) } as ScreenElement;
      return el;
    });
  page.content = apply(page.content);
  const overlays: Overlay[] = [];
  if (state.dialog) overlays.push({ kind: "dialog", id: state.dialog.id, title: state.dialog.title, body: apply(state.dialog.body), actions: state.dialog.actions, open: true });
  if (state.toast) overlays.push({ kind: "toast", id: "toast-1", text: state.toast, tone: "success", open: true });
  const base = slugify(title, 24);
  const n = (counter.get(base) ?? 0) + 1;
  counter.set(base, n);
  const nav: NavItem[] = app.nav.map((i) => ({ ...i, active: labelSimilarity(i.label, title) > 0.85 || undefined }));
  return ScreenDefinitionSchema.parse({
    id: n === 1 ? base : `${base}-${n}`,
    name: title,
    layout: "app",
    frame: "browser",
    direction: "ltr",
    browser: { url: `app.${slugify(appName, 20)}.example.com/${base}` },
    app: { name: appName },
    topbar: {
      search: app.search ? { placeholder: app.search } : undefined,
      nav: app.topNav.map((i) => ({ ...i, active: labelSimilarity(i.label, title) > 0.85 || undefined })),
      showBrand: !app.nav.length,
      actions: [],
      user: app.hasAvatar ? { name: "Account Owner", id: "topbar-user" } : undefined,
    },
    sidebar: app.nav.length ? { position: "left", items: nav, footer: [] } : undefined,
    header: page.title ? { title: page.title, actions: page.headerActions } : undefined,
    content: groupIntoCards(page.content),
    overlays,
    notes: `Reconstructed from source frame ${state.page.frameId}${state.dialog ? ` + dialog "${state.dialog.title}"` : ""}.`,
  });
}

/** Find (or add) the element a step acts on; returns its id. */
function ensureTarget(screen: ScreenDefinition, step: TutorialStep, notes: string[]): string {
  const label = step.action.required_real_label || step.action.target_label;
  const sim = (t: string | undefined) => (t ? labelSimilarity(t, label) : 0);
  const want = step.action.target_type;

  // Sidebar
  if (want === "sidebar_item" || screen.sidebar?.items.some((i) => sim(i.label) > 0.85)) {
    const nav = screen.sidebar?.items.find((i) => sim(i.label) > 0.8);
    if (nav) return nav.id;
    if (want === "sidebar_item" && screen.sidebar) {
      const id = idFor("nav", label);
      screen.sidebar.items.push({ id, label });
      notes.push(`${step.id}: added missing sidebar item "${label}"`);
      return id;
    }
  }
  const top = screen.topbar?.nav.find((i) => sim(i.label) > 0.8);
  if (top && (want === "link" || want === "tab" || want === "menu_item" || want === "button" || want === "sidebar_item")) {
    // A top-nav item wins only if no tab/page element carries the same label.
    if (!findTabLabel(screen.content, label)) return top.id;
  }
  // Dialogs first when one is open (the action happens inside it).
  const dialog = screen.overlays.find((o): o is Extract<Overlay, { kind: "dialog" }> => o.kind === "dialog" && o.open);
  const pools: ScreenElement[][] = [];
  if (dialog) pools.push(dialog.body, dialog.actions);
  pools.push(screen.header?.actions ?? [], screen.content, screen.topbar?.actions ?? []);
  for (const pool of pools) {
    const hit = findByLabel(pool, label, step.action.type);
    if (hit) return hit;
  }
  if (step.action.target_type === "icon" && screen.topbar?.user) return screen.topbar.user.id ?? "topbar-user";

  // Not found: inject a faithful control where the source had it.
  const injected = injectTarget(screen, dialog ?? null, step);
  notes.push(`${step.id}: target "${label}" not found in reconstructed screen — added as ${injected.kind}`);
  return injected.id;
}

function findTabLabel(els: ScreenElement[], label: string): boolean {
  return els.some((el) => (el.kind === "tabs" && el.tabs.some((t) => labelSimilarity(t.label, label) > 0.8)) || ("children" in el && Array.isArray(el.children) && findTabLabel(el.children, label)));
}

/** Best match by label across all nested elements (not the first fuzzy hit: "Notifications" ≠ "Email notifications"). */
function findByLabel(els: ScreenElement[], label: string, prefer?: TutorialStep["action"]["type"]): string | null {
  type Hit = { sim: number; bonus: number; apply: () => string };
  const hits: Hit[] = [];
  const consider = (text: string | undefined, bonus: number, apply: () => string) => {
    if (!text) return;
    const sim = labelSimilarity(text, label);
    if (sim > 0.8) hits.push({ sim, bonus, apply });
  };
  const wantsToggle = prefer === "toggle" || prefer === "check";
  const walk = (list: ScreenElement[]) => {
    for (const el of list) {
      const text = "label" in el ? el.label : el.kind === "text" ? el.text : el.kind === "card" ? el.title : undefined;
      const kindBonus = wantsToggle && (el.kind === "setting_row" || el.kind === "toggle" || el.kind === "checkbox") ? 0.2 : 0;
      consider(text, kindBonus, () => {
        // Teaching accuracy: show exactly the label the viewer must look for (fixes OCR typos like "sena invite").
        if ("label" in el && typeof el.label === "string") (el as { label: string }).label = label;
        else if (el.kind === "text") (el as { text: string }).text = label;
        if ("id" in el && el.id) return el.id;
        (el as { id?: string }).id = idFor("el", label);
        return (el as { id: string }).id;
      });
      if (el.kind === "tabs") for (const t of el.tabs) consider(t.label, wantsToggle ? -0.2 : 0, () => t.id);
      if (el.kind === "table") for (const r of el.rows) for (const c of r.cells) consider(c, -0.05, () => r.id);
      const kids: ScreenElement[] = [];
      if ("children" in el && Array.isArray(el.children)) kids.push(...el.children);
      if (el.kind === "card" && el.actions) kids.push(...el.actions);
      if (el.kind === "setting_row" && el.control) kids.push(el.control);
      if (kids.length) walk(kids);
    }
  };
  walk(els);
  if (!hits.length) return null;
  hits.sort((a, b) => b.sim + b.bonus - (a.sim + a.bonus));
  return hits[0]!.apply();
}

function injectTarget(screen: ScreenDefinition, dialog: Extract<Overlay, { kind: "dialog" }> | null, step: TutorialStep): { id: string; kind: string } {
  const label = step.action.required_real_label || step.action.target_label || "Continue";
  const t = step.action.type;
  let el: ScreenElement;
  if (t === "type") el = { kind: "input", id: idFor("input", label), label, placeholder: placeholderFor(label) };
  else if (t === "select") {
    const v = step.action.value ?? "Option";
    el = { kind: "dropdown", id: idFor("dd", label), label, value: "default", options: [{ id: "default", label: "Select…" }, { id: slugify(v, 30), label: v }] };
  } else if (t === "toggle" || t === "check") el = { kind: "setting_row", id: idFor("row", label), label, control: { kind: "toggle", id: idFor("toggle", label), label, on: false } };
  else el = { kind: "button", id: idFor("btn", label), label, variant: "primary" };
  const submitLike = /^(save|submit|apply|continue|done|confirm|send|update|finish|next)\b/i.test(label);
  if (dialog) (el.kind === "button" ? dialog.actions : dialog.body).push(el);
  // Form buttons (Save changes, Submit…) sit after the fields; other actions in the page header.
  else if (el.kind === "button" && submitLike) screen.content.push({ kind: "row", justify: "start", children: [el] });
  else if (el.kind === "button" && screen.header) screen.header.actions.push(el);
  else screen.content.unshift(el);
  return { id: t === "toggle" || t === "check" ? idFor("toggle", label) : (el as { id: string }).id, kind: el.kind };
}

/** Apply fidelity mode (faithful keeps everything). */
function applyFidelity(screen: ScreenDefinition, mode: FidelityMode, targets: Set<string>): ScreenDefinition {
  if (mode === "faithful") return screen;
  const keep = (el: ScreenElement): boolean => {
    const ids = collectTargetIds({ ...screen, content: [el], header: undefined, topbar: undefined, sidebar: undefined, overlays: [] });
    return [...ids].some((id) => targets.has(id));
  };
  if (mode === "simplified") {
    const content = screen.content
      .map((el) => (el.kind === "table" ? { ...el, rows: el.rows.slice(0, 3) } : el))
      .filter((el) => keep(el) || el.kind === "table" || el.kind === "grid")
      .slice(0, 4);
    return { ...screen, content };
  }
  // conceptual: only what is acted on stays real; the rest becomes neutral skeletons.
  const content: ScreenElement[] = screen.content.map((el) => (keep(el) ? el : { kind: "skeleton", lines: 3 }));
  const sidebar = screen.sidebar ? { ...screen.sidebar, items: screen.sidebar.items.filter((i, idx) => targets.has(i.id) || idx < 2) } : undefined;
  return { ...screen, content, sidebar };
}

export function reconstructScreens(input: ReconstructInput): ReconstructResult {
  const { frames } = input;
  const notes: string[] = [];
  const steps = [...input.tutorial.steps].sort((a, b) => a.order - b.order);
  const appName = input.tutorial.app.name;
  const app = buildAppModel(frames, appName);
  const counter = new Map<string, number>();

  const firstFrame = frameByFile(frames, steps[0]?.source.frame_before ?? null) ?? frames.analyses[0];
  if (!firstFrame) throw new Error("No analyzed frames — cannot reconstruct screens");

  // 1) Walk the steps, evolving the UI state; render one screen per state.
  const states: State[] = [];
  // Toggles the tutorial switches start in the opposite of their target state.
  const initialToggles: Record<string, boolean> = {};
  for (const s of steps) if (s.action.type === "toggle" || s.action.type === "check") initialToggles[idFor("toggle", s.action.required_real_label)] = s.action.value === "off";
  let state: State = { page: firstFrame, dialog: null, values: {}, selections: {}, toggles: initialToggles, toast: null, activeTab: null };
  for (const step of steps) {
    states.push(state);
    const before = frameByFile(frames, step.source.frame_before) ?? state.page;
    const after = frameByFile(frames, step.source.frame_after);
    const next: State = { ...state, values: { ...state.values }, selections: { ...state.selections }, toggles: { ...state.toggles }, toast: null };
    const said = step.what_user_sees_after;
    const label = step.action.required_real_label;
    if (step.action.type === "type" && step.action.value) next.values[idFor("input", label)] = step.action.value;
    else if (step.action.type === "select" && step.action.value) next.selections[idFor("dd", label)] = slugify(step.action.value, 30);
    else if (step.action.type === "toggle" || step.action.type === "check") next.toggles[idFor("toggle", label)] = step.action.value !== "off";
    else if (after && said.startsWith("נפתח החלון")) {
      const dlg = buildDialog(after, before, app, steps, frames);
      if (dlg) next.dialog = dlg;
      else notes.push(`${step.id}: dialog expected but not reconstructed`);
    } else if (after && (said.startsWith("מופיעה הודעה") || said.startsWith("מופיעה הודעת"))) {
      next.page = after;
      next.dialog = null;
      next.values = {};
      next.toast = /'(.+)'/.exec(said)?.[1] ?? "Done";
    } else if (after && (said.startsWith("נפתח העמוד") || said.startsWith("מופיע ") || said.startsWith("נפתחת הלשונית"))) {
      next.page = after;
      next.dialog = null;
      next.values = {};
      next.activeTab = null;
    }
    // A clicked tab stays selected on the screen that follows.
    if (step.action.target_type === "tab") next.activeTab = label;
    state = next;
  }
  states.push(state);
  const rendered = states.map((s) => renderScreen(s, app, appName, counter));

  // 2) Resolve every step's target on its "before" screen.
  const targetIds: string[] = [];
  steps.forEach((step, i) => targetIds.push(ensureTarget(rendered[i]!, step, notes)));
  const allTargets = new Set(targetIds);

  // 2b) Teaching accuracy: every occurrence of a step's label uses the exact real label (fixes OCR variants on all screens).
  const canonical = [...new Set(steps.map((s) => s.action.required_real_label).filter((l) => l && l.length > 2))];
  for (const sc of rendered) canonicalizeLabels(sc, canonical);

  // 3) Dummy data everywhere except real UI labels.
  // Only labels without personal data are protected; a "nav item" that is really a name or an amount gets replaced.
  const protect = new Set<string>([appName, ...steps.map((s) => s.action.required_real_label)]);
  for (const n of [...app.nav, ...app.topNav]) if (detectSensitive(n.label).length === 0) protect.add(n.label);
  const labels = new Set<string>();
  for (const sc of rendered) collectLabels(sc, labels);
  for (const l of labels) if (detectSensitive(l).length === 0) protect.add(l);
  const replacer = new DemoDataReplacer(protect, input.salt ?? input.tutorial.title);
  const finalScreens = rendered.map((sc) => scrubScreen(applyFidelity(sc, input.fidelity, allTargets), replacer));

  // 4) Dedupe identical consecutive screens and link steps.
  const unique: ScreenDefinition[] = [];
  const idMap = new Map<number, string>();
  // Screen ids come from the scrubbed title (never from source data).
  finalScreens.forEach((sc, i) => {
    sc.id = `s${String(i + 1).padStart(2, "0")}-${slugify(sc.header?.title ?? sc.name ?? "screen", 24)}`;
    sc.name = sc.header?.title ?? sc.name;
    sc.browser = sc.browser ? { url: sc.browser.url.replace(/\/[^/]*$/, `/${slugify(sc.header?.title ?? "home", 24)}`) } : undefined;
  });
  finalScreens.forEach((sc, i) => {
    const key = JSON.stringify({ ...sc, id: "", notes: "" });
    const hit = unique.find((u) => JSON.stringify({ ...u, id: "", notes: "" }) === key);
    if (hit) idMap.set(i, hit.id);
    else {
      unique.push(sc);
      idMap.set(i, sc.id);
    }
  });

  const tutorialSteps = steps.map((s, i) => {
    const beforeId = idMap.get(i)!;
    const afterId = idMap.get(i + 1)!;
    const scrubbed = {
      ...s,
      instruction_he: replacer.scrub(s.instruction_he),
      what_user_sees_after: replacer.scrub(s.what_user_sees_after),
      what_user_sees_before: replacer.scrub(s.what_user_sees_before),
      goal: replacer.scrub(s.goal),
      action: { ...s.action, value: s.action.value ? replacer.scrub(s.action.value) : null },
      screen: { before: beforeId, after: afterId !== beforeId ? afterId : null, target_element: targetIds[i]! },
    };
    return scrubbed;
  });
  // Typed values inside screens must match the scrubbed step values.
  for (const sc of unique) {
    for (const o of sc.overlays) if (o.kind === "dialog") o.body = o.body.map((el) => (el.kind === "input" && el.value ? { ...el, value: replacer.scrub(el.value) } : el));
  }

  let tutorial = Tutorial.parse({ ...input.tutorial, fidelity_mode: input.fidelity, steps: tutorialSteps, summary: replacer.scrub(input.tutorial.summary) });

  // Privacy guard (Module 22): no sensitive string seen in the source may survive into the reconstruction.
  const guarded = guardLeaks(frames, { screens: unique, tutorial }, replacer, new Set(steps.map((s) => s.action.required_real_label)));
  unique.splice(0, unique.length, ...guarded.value.screens);
  tutorial = guarded.value.tutorial;
  if (guarded.fixed) notes.push(`privacy guard replaced ${guarded.fixed} leftover sensitive string(s)`);
  const screens = ScreenSetSchema.parse({
    version: 1,
    fidelityMode: input.fidelity,
    screens: unique,
    substitutions: replacer.substitutions.map((s) => ({ kind: s.kind, originalHash: hashString(s.original), replacement: s.replacement })),
  });
  return { screens, tutorial, notes };
}

export class PrivacyLeakError extends Error {
  constructor(public readonly kinds: string[]) {
    super(`Sensitive source data still present after reconstruction (${kinds.join(", ")}) — refusing to continue`);
    this.name = "PrivacyLeakError";
  }
}

/** Replace any leftover source PII (exact strings found during analysis); throw if something still remains. */
export function guardLeaks<T>(frames: FramesAnalysisResult, value: T, replacer: DemoDataReplacer, allowed: Set<string>): { value: T; fixed: number } {
  const findings = new Map<string, string>();
  for (const f of frames.sensitive) {
    const t = f.text.trim();
    if (t.length >= 4 && !allowed.has(t) && !isDummy(t)) findings.set(t, f.kind);
  }
  let json = JSON.stringify(value);
  let fixed = 0;
  for (const [text, kind] of [...findings.entries()].sort((a, b) => b[0].length - a[0].length)) {
    const needle = JSON.stringify(text).slice(1, -1);
    if (!json.includes(needle)) continue;
    const repl = JSON.stringify(replacer.replaceFinding(kind as Parameters<DemoDataReplacer["replaceFinding"]>[0], text)).slice(1, -1);
    json = json.split(needle).join(repl);
    fixed++;
  }
  const left = [...findings.entries()].filter(([t]) => json.includes(JSON.stringify(t).slice(1, -1)));
  if (left.length) throw new PrivacyLeakError([...new Set(left.map(([, k]) => k))]);
  return { value: JSON.parse(json) as T, fixed };
}

function canonicalizeLabels(sc: ScreenDefinition, labels: string[]) {
  const fix = (t: string): string => {
    for (const l of labels) {
      if (t === l) return t;
      if (labelSimilarity(t, l) > 0.8 && Math.abs(t.length - l.length) <= 2) return l;
    }
    return t;
  };
  const walk = (els: ScreenElement[]) => {
    for (const el of els) {
      if ((el.kind === "button" || el.kind === "input" || el.kind === "dropdown") && el.label) (el as { label: string }).label = fix(el.label);
      if ("children" in el && Array.isArray(el.children)) walk(el.children);
    }
  };
  walk(sc.header?.actions ?? []);
  walk(sc.content);
  for (const o of sc.overlays) if (o.kind === "dialog") {
    walk(o.body);
    walk(o.actions);
  }
  for (const n of sc.sidebar?.items ?? []) n.label = fix(n.label);
  for (const n of sc.topbar?.nav ?? []) n.label = fix(n.label);
}

function collectLabels(sc: ScreenDefinition, into: Set<string>) {
  // Header titles are not protected: they may contain names ("Welcome back, John").
  const walk = (els: ScreenElement[]) => {
    for (const el of els) {
      if (el.kind === "button" || el.kind === "input" || el.kind === "dropdown" || el.kind === "toggle" || el.kind === "checkbox") {
        if (el.label) into.add(el.label);
      }
      if (el.kind === "dropdown") for (const o of el.options) into.add(o.label);
      if (el.kind === "metric") into.add(el.label);
      if (el.kind === "table") for (const c of el.columns) into.add(c);
      if (el.kind === "tabs") for (const t of el.tabs) into.add(t.label);
      if ("children" in el && Array.isArray(el.children)) walk(el.children);
    }
  };
  walk(sc.header?.actions ?? []);
  walk(sc.content);
  for (const o of sc.overlays) {
    if (o.kind === "dialog") {
      into.add(o.title);
      walk(o.body);
      walk(o.actions);
    }
  }
}

function scrubScreen(sc: ScreenDefinition, r: DemoDataReplacer): ScreenDefinition {
  const out = scrubDeep(sc, r, new Set(["id", "kind", "icon", "variant", "anchor", "placement", "layout", "frame", "direction", "tone", "trend", "value", "notes", "url"]));
  // Metric values and dropdown values handled explicitly.
  const fixMetrics = (els: ScreenElement[]): ScreenElement[] =>
    els.map((el) => {
      if (el.kind === "metric") return { ...el, value: /[@$€£₪]|[A-Z]{2,}-\d/.test(el.value) ? r.scrub(el.value) : r.scrubNumber(el.value) };
      if (el.kind === "input" && el.value) return { ...el, value: r.scrub(el.value) };
      if ("children" in el && Array.isArray(el.children)) return { ...el, children: fixMetrics(el.children) } as ScreenElement;
      return el;
    });
  return { ...out, content: fixMetrics(out.content), topbar: out.topbar?.user ? { ...out.topbar, user: { ...out.topbar.user, name: r.personName("Account Owner Person") } } : out.topbar };
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
