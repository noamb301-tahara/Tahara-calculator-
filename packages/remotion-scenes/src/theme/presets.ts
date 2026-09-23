import type { StylePresetName } from "@studio/shared";

/**
 * Style presets (Module 20). The tutorial structure never changes with the
 * preset; only these tokens do. Colors intentionally differ from typical
 * source products so the reconstruction never looks like a screenshot copy.
 */
export interface StyleTokens {
  name: StylePresetName;
  fonts: { ui: string; chrome: string; mono: string };
  canvas: {
    background: string;
    decoration: "none" | "blobs" | "grid" | "dots";
    decorationColor: string;
  };
  chrome: {
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    badgeBg: string;
    badgeText: string;
    subtitleBg: string;
    subtitleText: string;
    subtitleHighlight: string;
    progressTrack: string;
  };
  ui: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    borderWidth: number;
    text: string;
    muted: string;
    primary: string;
    primaryText: string;
    primarySoft: string;
    danger: string;
    success: string;
    warning: string;
    info: string;
    radius: number;
    radiusSm: number;
    shadow: string;
    shadowLg: string;
    sidebarBg: string;
    sidebarText: string;
    sidebarMuted: string;
    sidebarActiveBg: string;
    sidebarActiveText: string;
    topbarBg: string;
    inputBg: string;
    toggleOff: string;
    tableHeaderBg: string;
    browserChrome: string;
    browserChromeText: string;
    /** Soft decorative shapes inside cards/media (Illustrated preset). */
    illustrated: boolean;
    fontSize: number;
  };
  overlay: {
    highlight: string;
    highlightGlow: string;
    spotlightDim: string;
    pulse: string;
    cursorFill: string;
    cursorStroke: string;
    calloutBg: string;
    calloutText: string;
    calloutSubText: string;
    warningBg: string;
    warningText: string;
    successBg: string;
    successText: string;
  };
}

const FONT_STACK_UI = "'Inter', 'Heebo', system-ui, sans-serif";
const FONT_STACK_HE = "'Heebo', 'Inter', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, 'DejaVu Sans Mono', monospace";

const clean: StyleTokens = {
  name: "clean",
  fonts: { ui: FONT_STACK_UI, chrome: FONT_STACK_HE, mono: FONT_MONO },
  canvas: { background: "linear-gradient(180deg, #f6f7f9 0%, #eceef2 100%)", decoration: "dots", decorationColor: "rgba(20,24,33,0.06)" },
  chrome: {
    text: "#111418",
    muted: "#5c6470",
    accent: "#111418",
    accentText: "#ffffff",
    badgeBg: "#111418",
    badgeText: "#ffffff",
    subtitleBg: "rgba(17,20,24,0.92)",
    subtitleText: "#ffffff",
    subtitleHighlight: "#ffd84d",
    progressTrack: "rgba(17,20,24,0.12)",
  },
  ui: {
    bg: "#fafafa",
    surface: "#ffffff",
    surfaceAlt: "#f3f4f6",
    border: "#e3e5e8",
    borderWidth: 1.5,
    text: "#16181d",
    muted: "#6b717c",
    primary: "#1f2937",
    primaryText: "#ffffff",
    primarySoft: "#eef0f3",
    danger: "#d93636",
    success: "#1f9d55",
    warning: "#c77700",
    info: "#2563eb",
    radius: 14,
    radiusSm: 9,
    shadow: "0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.04)",
    shadowLg: "0 24px 60px rgba(17,20,24,0.18), 0 4px 14px rgba(17,20,24,0.08)",
    sidebarBg: "#f6f7f8",
    sidebarText: "#2b2f36",
    sidebarMuted: "#8a909a",
    sidebarActiveBg: "#e6e8ec",
    sidebarActiveText: "#111418",
    topbarBg: "#ffffff",
    inputBg: "#ffffff",
    toggleOff: "#cfd3d9",
    tableHeaderBg: "#f6f7f8",
    browserChrome: "#eceef1",
    browserChromeText: "#4b515b",
    illustrated: false,
    fontSize: 25,
  },
  overlay: {
    highlight: "#ff5a36",
    highlightGlow: "rgba(255,90,54,0.35)",
    spotlightDim: "rgba(10,12,16,0.55)",
    pulse: "rgba(255,90,54,0.55)",
    cursorFill: "#111418",
    cursorStroke: "#ffffff",
    calloutBg: "#111418",
    calloutText: "#ffffff",
    calloutSubText: "#ffd84d",
    warningBg: "#fff4d6",
    warningText: "#6b4a00",
    successBg: "#e3f7ea",
    successText: "#0f5c30",
  },
};

const illustrated: StyleTokens = {
  name: "illustrated",
  fonts: { ui: "'Rubik', 'Heebo', system-ui, sans-serif", chrome: "'Rubik', 'Heebo', system-ui, sans-serif", mono: FONT_MONO },
  canvas: { background: "linear-gradient(170deg, #fff5e8 0%, #ffe7d6 45%, #f3e3ff 100%)", decoration: "blobs", decorationColor: "rgba(255,153,102,0.22)" },
  chrome: {
    text: "#2d1b4e",
    muted: "#6e5b8c",
    accent: "#ff7a45",
    accentText: "#ffffff",
    badgeBg: "#2d1b4e",
    badgeText: "#fff5e8",
    subtitleBg: "rgba(45,27,78,0.93)",
    subtitleText: "#fffaf3",
    subtitleHighlight: "#ffb88a",
    progressTrack: "rgba(45,27,78,0.12)",
  },
  ui: {
    bg: "#fffaf4",
    surface: "#ffffff",
    surfaceAlt: "#fff1e4",
    border: "#f0dccb",
    borderWidth: 2,
    text: "#2d1b4e",
    muted: "#7d6a98",
    primary: "#6b4de6",
    primaryText: "#ffffff",
    primarySoft: "#efe9ff",
    danger: "#e2445c",
    success: "#1fae7a",
    warning: "#e08a00",
    info: "#3f7ff0",
    radius: 22,
    radiusSm: 14,
    shadow: "0 3px 0 rgba(45,27,78,0.08)",
    shadowLg: "0 28px 60px rgba(45,27,78,0.20), 0 6px 0 rgba(45,27,78,0.08)",
    sidebarBg: "#fff1e4",
    sidebarText: "#2d1b4e",
    sidebarMuted: "#9b87b5",
    sidebarActiveBg: "#ffffff",
    sidebarActiveText: "#6b4de6",
    topbarBg: "#fffaf4",
    inputBg: "#ffffff",
    toggleOff: "#e6d6c6",
    tableHeaderBg: "#fff1e4",
    browserChrome: "#ffe7d6",
    browserChromeText: "#6e5b8c",
    illustrated: true,
    fontSize: 25,
  },
  overlay: {
    highlight: "#ff7a45",
    highlightGlow: "rgba(255,122,69,0.4)",
    spotlightDim: "rgba(45,27,78,0.5)",
    pulse: "rgba(255,122,69,0.6)",
    cursorFill: "#2d1b4e",
    cursorStroke: "#ffffff",
    calloutBg: "#2d1b4e",
    calloutText: "#fffaf3",
    calloutSubText: "#ffb88a",
    warningBg: "#fff0c7",
    warningText: "#6b4a00",
    successBg: "#dcf7ec",
    successText: "#0b5e40",
  },
};

const modernSaas: StyleTokens = {
  name: "modern-saas",
  fonts: { ui: FONT_STACK_UI, chrome: FONT_STACK_HE, mono: FONT_MONO },
  canvas: { background: "radial-gradient(120% 80% at 50% 0%, #e9edff 0%, #f5f6fb 55%, #eef1f8 100%)", decoration: "grid", decorationColor: "rgba(60,72,140,0.07)" },
  chrome: {
    text: "#0f1533",
    muted: "#57608a",
    accent: "#4f46e5",
    accentText: "#ffffff",
    badgeBg: "#4f46e5",
    badgeText: "#ffffff",
    subtitleBg: "rgba(15,21,51,0.92)",
    subtitleText: "#ffffff",
    subtitleHighlight: "#9ee6ff",
    progressTrack: "rgba(79,70,229,0.14)",
  },
  ui: {
    bg: "#f7f8fc",
    surface: "#ffffff",
    surfaceAlt: "#f2f4fa",
    border: "#e2e6f0",
    borderWidth: 1.5,
    text: "#141a36",
    muted: "#6a7396",
    primary: "#4f46e5",
    primaryText: "#ffffff",
    primarySoft: "#eceafe",
    danger: "#e5484d",
    success: "#12a150",
    warning: "#d97706",
    info: "#0ea5e9",
    radius: 16,
    radiusSm: 10,
    shadow: "0 1px 2px rgba(20,26,54,0.06), 0 4px 16px rgba(20,26,54,0.05)",
    shadowLg: "0 30px 70px rgba(20,26,54,0.22), 0 6px 18px rgba(20,26,54,0.08)",
    sidebarBg: "#10163a",
    sidebarText: "#dfe3ff",
    sidebarMuted: "#8189b8",
    sidebarActiveBg: "#252d66",
    sidebarActiveText: "#ffffff",
    topbarBg: "#ffffff",
    inputBg: "#ffffff",
    toggleOff: "#cfd4e6",
    tableHeaderBg: "#f5f7fc",
    browserChrome: "#e7eaf4",
    browserChromeText: "#4d5680",
    illustrated: false,
    fontSize: 25,
  },
  overlay: {
    highlight: "#f59e0b",
    highlightGlow: "rgba(245,158,11,0.38)",
    spotlightDim: "rgba(8,11,30,0.58)",
    pulse: "rgba(245,158,11,0.6)",
    cursorFill: "#0f1533",
    cursorStroke: "#ffffff",
    calloutBg: "#0f1533",
    calloutText: "#ffffff",
    calloutSubText: "#fbbf24",
    warningBg: "#fff3d6",
    warningText: "#7a4b00",
    successBg: "#dcfce7",
    successText: "#0b5b2c",
  },
};

const dark: StyleTokens = {
  name: "dark",
  fonts: { ui: FONT_STACK_UI, chrome: FONT_STACK_HE, mono: FONT_MONO },
  canvas: { background: "radial-gradient(110% 70% at 50% 0%, #1d2440 0%, #0c0f1c 60%, #07090f 100%)", decoration: "grid", decorationColor: "rgba(140,160,255,0.06)" },
  chrome: {
    text: "#f2f4ff",
    muted: "#9aa3c7",
    accent: "#7c8cff",
    accentText: "#0b0e1a",
    badgeBg: "#7c8cff",
    badgeText: "#0b0e1a",
    subtitleBg: "rgba(255,255,255,0.95)",
    subtitleText: "#0b0e1a",
    subtitleHighlight: "#4453e0",
    progressTrack: "rgba(255,255,255,0.12)",
  },
  ui: {
    bg: "#10131f",
    surface: "#171b2b",
    surfaceAlt: "#1d2236",
    border: "#2a3050",
    borderWidth: 1.5,
    text: "#eef0fb",
    muted: "#949cc0",
    primary: "#7c8cff",
    primaryText: "#0b0e1a",
    primarySoft: "#252c52",
    danger: "#ff6b6b",
    success: "#3ddc97",
    warning: "#ffb454",
    info: "#5cc8ff",
    radius: 16,
    radiusSm: 10,
    shadow: "0 1px 0 rgba(255,255,255,0.03), 0 6px 20px rgba(0,0,0,0.35)",
    shadowLg: "0 34px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,140,255,0.12)",
    sidebarBg: "#0c0f1a",
    sidebarText: "#cfd4f2",
    sidebarMuted: "#6d759c",
    sidebarActiveBg: "#1f2544",
    sidebarActiveText: "#ffffff",
    topbarBg: "#131726",
    inputBg: "#10131f",
    toggleOff: "#394063",
    tableHeaderBg: "#1a1f33",
    browserChrome: "#1a1e2e",
    browserChromeText: "#9aa3c7",
    illustrated: false,
    fontSize: 25,
  },
  overlay: {
    highlight: "#ffd166",
    highlightGlow: "rgba(255,209,102,0.35)",
    spotlightDim: "rgba(0,0,0,0.62)",
    pulse: "rgba(255,209,102,0.55)",
    cursorFill: "#ffffff",
    cursorStroke: "#0b0e1a",
    calloutBg: "#ffffff",
    calloutText: "#0b0e1a",
    calloutSubText: "#4453e0",
    warningBg: "#3a2d0f",
    warningText: "#ffd98a",
    successBg: "#0f3326",
    successText: "#9ff0c8",
  },
};

export const STYLE_PRESETS: Record<StylePresetName, StyleTokens> = {
  clean,
  illustrated,
  "modern-saas": modernSaas,
  dark,
};

export function getPreset(name: StylePresetName | null | undefined): StyleTokens {
  return STYLE_PRESETS[name ?? "modern-saas"] ?? modernSaas;
}
