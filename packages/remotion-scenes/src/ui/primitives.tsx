import React from "react";
import type { Option, Tone } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import type { StyleTokens } from "../theme/presets";
import { Icon } from "../icons";
import { usePressed, useTarget } from "./context";

/**
 * Demo UI primitives (Module 10). Sized for 9:16 phone viewing: large type,
 * generous padding, strong contrast. All styling comes from the preset tokens.
 */

export function toneColor(t: StyleTokens, tone: Tone | undefined): { fg: string; bg: string } {
  switch (tone) {
    case "success":
      return { fg: t.ui.success, bg: `${t.ui.success}1f` };
    case "warning":
      return { fg: t.ui.warning, bg: `${t.ui.warning}22` };
    case "danger":
      return { fg: t.ui.danger, bg: `${t.ui.danger}1c` };
    case "info":
      return { fg: t.ui.info, bg: `${t.ui.info}1c` };
    case "accent":
      return { fg: t.ui.primary, bg: t.ui.primarySoft };
    default:
      return { fg: t.ui.muted, bg: t.ui.surfaceAlt };
  }
}

export const Text: React.FC<{ text: string; variant?: "title" | "heading" | "body" | "muted" | "label" | "code"; id?: string }> = ({ text, variant = "body", id }) => {
  const t = useTheme();
  const target = useTarget(id);
  const base = t.ui.fontSize;
  const styles: Record<string, React.CSSProperties> = {
    title: { fontSize: base * 1.45, fontWeight: 700, letterSpacing: -0.5, color: t.ui.text },
    heading: { fontSize: base * 1.1, fontWeight: 650, color: t.ui.text },
    body: { fontSize: base, color: t.ui.text, lineHeight: 1.4 },
    muted: { fontSize: base * 0.88, color: t.ui.muted, lineHeight: 1.4 },
    label: { fontSize: base * 0.78, fontWeight: 600, color: t.ui.muted, textTransform: "uppercase", letterSpacing: 0.6 },
    code: { fontSize: base * 0.85, fontFamily: t.fonts.mono, color: t.ui.text, background: t.ui.surfaceAlt, padding: "4px 10px", borderRadius: t.ui.radiusSm },
  };
  return (
    <div {...target} style={styles[variant]}>
      {text}
    </div>
  );
};

export const Button: React.FC<{
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "link";
  icon?: string;
  size?: "sm" | "md" | "lg";
}> = ({ id, label, variant = "secondary", icon, size = "md" }) => {
  const t = useTheme();
  const target = useTarget(id);
  const pressed = usePressed(id);
  const pad = size === "sm" ? "10px 16px" : size === "lg" ? "18px 30px" : "14px 22px";
  const fs = t.ui.fontSize * (size === "sm" ? 0.82 : size === "lg" ? 1.05 : 0.92);
  const v: Record<string, React.CSSProperties> = {
    primary: { background: t.ui.primary, color: t.ui.primaryText, border: `${t.ui.borderWidth}px solid ${t.ui.primary}` },
    secondary: { background: t.ui.surface, color: t.ui.text, border: `${t.ui.borderWidth}px solid ${t.ui.border}` },
    ghost: { background: "transparent", color: t.ui.text, border: `${t.ui.borderWidth}px solid transparent` },
    danger: { background: t.ui.danger, color: "#fff", border: `${t.ui.borderWidth}px solid ${t.ui.danger}` },
    link: { background: "transparent", color: t.ui.primary, border: "none", padding: 0, textDecoration: "underline" },
  };
  return (
    <div
      {...target}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: variant === "link" ? 0 : pad,
        borderRadius: t.ui.radiusSm,
        fontSize: fs,
        fontWeight: 600,
        whiteSpace: "nowrap",
        boxShadow: variant === "primary" || variant === "secondary" ? t.ui.shadow : "none",
        transform: pressed ? "scale(0.96)" : "none",
        filter: pressed ? "brightness(0.93)" : "none",
        ...v[variant],
      }}
    >
      {icon ? <Icon name={icon} size={fs * 1.1} /> : null}
      <span>{label}</span>
    </div>
  );
};

export const IconButton: React.FC<{ id: string; icon: string; label: string }> = ({ id, icon }) => {
  const t = useTheme();
  const target = useTarget(id);
  const pressed = usePressed(id);
  return (
    <div
      {...target}
      style={{
        width: 52,
        height: 52,
        borderRadius: t.ui.radiusSm,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: t.ui.text,
        background: pressed ? t.ui.surfaceAlt : "transparent",
        transform: pressed ? "scale(0.94)" : "none",
      }}
    >
      <Icon name={icon} size={28} />
    </div>
  );
};

export const Input: React.FC<{
  id: string;
  label?: string;
  placeholder?: string;
  value?: string;
  inputType?: string;
  helper?: string;
  multiline?: boolean;
  typing?: boolean;
  focused?: boolean;
}> = ({ id, label, placeholder, value, inputType, helper, multiline, typing, focused }) => {
  const t = useTheme();
  const target = useTarget(id);
  const shown = inputType === "password" && value ? "•".repeat(value.length) : value;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {label ? <div style={{ fontSize: t.ui.fontSize * 0.82, fontWeight: 600, color: t.ui.text }}>{label}</div> : null}
      <div
        {...target}
        style={{
          display: "flex",
          alignItems: multiline ? "flex-start" : "center",
          gap: 10,
          minHeight: multiline ? 120 : 60,
          padding: "12px 18px",
          borderRadius: t.ui.radiusSm,
          background: t.ui.inputBg,
          border: `${t.ui.borderWidth + (focused ? 0.5 : 0)}px solid ${focused ? t.ui.primary : t.ui.border}`,
          boxShadow: focused ? `0 0 0 4px ${t.ui.primarySoft}` : "none",
          fontSize: t.ui.fontSize * 0.92,
          color: shown ? t.ui.text : t.ui.muted,
        }}
      >
        {inputType === "search" ? <Icon name="search" size={24} color={t.ui.muted} /> : null}
        <span style={{ whiteSpace: "pre-wrap" }}>{shown || placeholder || ""}</span>
        {typing ? <span style={{ width: 2.5, height: 30, background: t.ui.primary, marginLeft: -6 }} /> : null}
      </div>
      {helper ? <div style={{ fontSize: t.ui.fontSize * 0.74, color: t.ui.muted }}>{helper}</div> : null}
    </div>
  );
};

export const Dropdown: React.FC<{
  id: string;
  label?: string;
  value: string;
  options: Option[];
  open: number;
  hover?: string;
}> = ({ id, label, value, options, open, hover }) => {
  const t = useTheme();
  const target = useTarget(id);
  const selected = options.find((o) => o.id === value) ?? options[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      {label ? <div style={{ fontSize: t.ui.fontSize * 0.82, fontWeight: 600, color: t.ui.text }}>{label}</div> : null}
      <div style={{ position: "relative" }}>
        <div
          {...target}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 60,
            padding: "0 18px",
            borderRadius: t.ui.radiusSm,
            background: t.ui.inputBg,
            border: `${t.ui.borderWidth}px solid ${open > 0 ? t.ui.primary : t.ui.border}`,
            fontSize: t.ui.fontSize * 0.92,
            color: t.ui.text,
          }}
        >
          <span>{selected?.label}</span>
          <Icon name="chevron-down" size={24} color={t.ui.muted} />
        </div>
        {open > 0.01 ? (
          <div
            style={{
              position: "absolute",
              top: 68,
              left: 0,
              right: 0,
              zIndex: 40,
              background: t.ui.surface,
              border: `${t.ui.borderWidth}px solid ${t.ui.border}`,
              borderRadius: t.ui.radiusSm,
              boxShadow: t.ui.shadowLg,
              padding: 6,
              opacity: open,
              transform: `translateY(${(1 - open) * -10}px)`,
            }}
          >
            {options.map((o) => (
              <OptionRow key={o.id} id={o.id} label={o.label} active={o.id === (hover ?? value)} selected={o.id === value} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const OptionRow: React.FC<{ id: string; label: string; active: boolean; selected: boolean }> = ({ id, label, active, selected }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div
      {...target}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px",
        borderRadius: t.ui.radiusSm - 2,
        background: active ? t.ui.primarySoft : "transparent",
        color: active ? t.ui.primary : t.ui.text,
        fontSize: t.ui.fontSize * 0.9,
        fontWeight: selected ? 600 : 400,
      }}
    >
      {label}
      {selected ? <Icon name="check" size={22} /> : null}
    </div>
  );
};

export const ToggleSwitch: React.FC<{ id?: string; on: boolean; anim?: number }> = ({ id, on, anim = 1 }) => {
  const t = useTheme();
  const target = useTarget(id);
  // Knob animates between positions when anim < 1.
  const pos = on ? anim : 1 - anim;
  const w = 76;
  const h = 42;
  const knob = h - 8;
  return (
    <div
      {...target}
      style={{
        width: w,
        height: h,
        borderRadius: h,
        background: mix(t.ui.toggleOff, t.ui.primary, pos),
        position: "relative",
        flexShrink: 0,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 4 + pos * (w - knob - 8),
          width: knob,
          height: knob,
          borderRadius: knob,
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
};

export const Toggle: React.FC<{ id: string; label: string; description?: string; on: boolean; anim?: number }> = ({ id, label, description, on, anim }) => {
  const t = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: t.ui.fontSize * 0.95, fontWeight: 600, color: t.ui.text }}>{label}</div>
        {description ? <div style={{ fontSize: t.ui.fontSize * 0.78, color: t.ui.muted }}>{description}</div> : null}
      </div>
      <ToggleSwitch id={id} on={on} anim={anim} />
    </div>
  );
};

export const Checkbox: React.FC<{ id: string; label: string; description?: string; checked: boolean; anim?: number }> = ({ id, label, description, checked, anim = 1 }) => {
  const t = useTheme();
  const target = useTarget(id);
  const p = checked ? anim : 1 - anim;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <div
        {...target}
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          flexShrink: 0,
          border: `2.5px solid ${p > 0.5 ? t.ui.primary : t.ui.border}`,
          background: p > 0.5 ? t.ui.primary : t.ui.inputBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {p > 0.5 ? <Icon name="check" size={24} color={t.ui.primaryText} strokeWidth={3} style={{ transform: `scale(${0.6 + 0.4 * p})` }} /> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: t.ui.fontSize * 0.92, color: t.ui.text, fontWeight: 500 }}>{label}</div>
        {description ? <div style={{ fontSize: t.ui.fontSize * 0.76, color: t.ui.muted }}>{description}</div> : null}
      </div>
    </div>
  );
};

export const RadioGroup: React.FC<{ id: string; label?: string; value: string; options: Option[] }> = ({ id, label, value, options }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {label ? <div style={{ fontSize: t.ui.fontSize * 0.82, fontWeight: 600, color: t.ui.text }}>{label}</div> : null}
      {options.map((o) => (
        <RadioRow key={o.id} id={o.id} label={o.label} selected={o.id === value} />
      ))}
    </div>
  );
};

const RadioRow: React.FC<{ id: string; label: string; selected: boolean }> = ({ id, label, selected }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: t.ui.fontSize * 0.9, color: t.ui.text }}>
      <div style={{ width: 32, height: 32, borderRadius: 32, border: `2.5px solid ${selected ? t.ui.primary : t.ui.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {selected ? <div style={{ width: 16, height: 16, borderRadius: 16, background: t.ui.primary }} /> : null}
      </div>
      {label}
    </div>
  );
};

export const Badge: React.FC<{ text: string; tone?: Tone; id?: string }> = ({ text, tone, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  const c = toneColor(t, tone);
  return (
    <span {...target} style={{ display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: 999, fontSize: t.ui.fontSize * 0.7, fontWeight: 600, color: c.fg, background: c.bg, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
};

const AVATAR_COLORS = ["#f97366", "#f5a524", "#34c38f", "#38bdf8", "#8b5cf6", "#ec4899", "#14b8a6"];

export const Avatar: React.FC<{ name: string; size?: number; id?: string }> = ({ name, size = 48, id }) => {
  const target = useTarget(id);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <div {...target} style={{ width: size, height: size, borderRadius: size, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

export const Tabs: React.FC<{ id: string; tabs: Option[]; active: string }> = ({ id, tabs, active }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", gap: 6, borderBottom: `${t.ui.borderWidth}px solid ${t.ui.border}`, width: "100%" }}>
      {tabs.map((tab) => (
        <TabItem key={tab.id} id={tab.id} label={tab.label} active={tab.id === active} />
      ))}
    </div>
  );
};

const TabItem: React.FC<{ id: string; label: string; active: boolean }> = ({ id, label, active }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div
      {...target}
      style={{
        padding: "14px 18px",
        fontSize: t.ui.fontSize * 0.9,
        fontWeight: active ? 650 : 500,
        color: active ? t.ui.primary : t.ui.muted,
        borderBottom: `3px solid ${active ? t.ui.primary : "transparent"}`,
        marginBottom: -t.ui.borderWidth,
      }}
    >
      {label}
    </div>
  );
};

export const MetricCard: React.FC<{ label: string; value: string; delta?: string; trend?: "up" | "down" | "flat"; id?: string }> = ({ label, value, delta, trend, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  const color = trend === "down" ? t.ui.danger : trend === "up" ? t.ui.success : t.ui.muted;
  return (
    <div {...target} style={{ ...cardStyle(t), padding: 22, display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: t.ui.fontSize * 0.78, color: t.ui.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: t.ui.fontSize * 1.45, fontWeight: 700, color: t.ui.text, letterSpacing: -0.5 }}>{value}</div>
      {delta ? <div style={{ fontSize: t.ui.fontSize * 0.74, color, fontWeight: 600 }}>{delta}</div> : null}
    </div>
  );
};

export function cardStyle(t: StyleTokens): React.CSSProperties {
  return {
    background: t.ui.surface,
    border: `${t.ui.borderWidth}px solid ${t.ui.border}`,
    borderRadius: t.ui.radius,
    boxShadow: t.ui.shadow,
  };
}

export const Card: React.FC<{ id?: string; title?: string; subtitle?: string; actions?: React.ReactNode; children?: React.ReactNode }> = ({ id, title, subtitle, actions, children }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ ...cardStyle(t), padding: 26, display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
      {t.ui.illustrated ? <Blob color={t.ui.primarySoft} /> : null}
      {title || actions ? (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {title ? <div style={{ fontSize: t.ui.fontSize * 1.05, fontWeight: 700, color: t.ui.text }}>{title}</div> : null}
            {subtitle ? <div style={{ fontSize: t.ui.fontSize * 0.8, color: t.ui.muted }}>{subtitle}</div> : null}
          </div>
          {actions ? <div style={{ display: "flex", gap: 10 }}>{actions}</div> : null}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, position: "relative" }}>{children}</div>
    </div>
  );
};

const Blob: React.FC<{ color: string }> = ({ color }) => (
  <svg width="160" height="120" viewBox="0 0 160 120" style={{ position: "absolute", right: -10, top: -12, opacity: 0.9 }}>
    <path d="M40 10 C80 -8 150 8 152 54 C154 98 104 118 64 108 C22 98 -6 70 6 42 C12 26 22 18 40 10Z" fill={color} />
  </svg>
);

export const Table: React.FC<{ id?: string; columns: string[]; rows: { id: string; cells: string[]; badge?: { text: string; tone?: Tone } }[] }> = ({ id, columns, rows }) => {
  const t = useTheme();
  const target = useTarget(id);
  const cols = columns.length + (rows.some((r) => r.badge) ? 1 : 0);
  return (
    <div {...target} style={{ ...cardStyle(t), overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, background: t.ui.tableHeaderBg, padding: "14px 22px", gap: 12 }}>
        {columns.map((c) => (
          <div key={c} style={{ fontSize: t.ui.fontSize * 0.74, fontWeight: 600, color: t.ui.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {c}
          </div>
        ))}
        {cols > columns.length ? <div /> : null}
      </div>
      {rows.map((r) => (
        <TableRow key={r.id} row={r} cols={cols} />
      ))}
    </div>
  );
};

const TableRow: React.FC<{ row: { id: string; cells: string[]; badge?: { text: string; tone?: Tone } }; cols: number }> = ({ row, cols }) => {
  const t = useTheme();
  const target = useTarget(row.id);
  return (
    <div {...target} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, padding: "18px 22px", gap: 12, borderTop: `${t.ui.borderWidth}px solid ${t.ui.border}`, alignItems: "center" }}>
      {row.cells.map((c, i) => (
        <div key={i} style={{ fontSize: t.ui.fontSize * 0.86, color: i === 0 ? t.ui.text : t.ui.muted, fontWeight: i === 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c}
        </div>
      ))}
      {row.badge ? (
        <div>
          <Badge text={row.badge.text} tone={row.badge.tone} />
        </div>
      ) : null}
    </div>
  );
};

export const List: React.FC<{ id?: string; items: { id: string; label: string; description?: string; icon?: string; meta?: string }[] }> = ({ id, items }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ ...cardStyle(t), overflow: "hidden" }}>
      {items.map((it, i) => (
        <ListRow key={it.id} item={it} first={i === 0} />
      ))}
    </div>
  );
};

const ListRow: React.FC<{ item: { id: string; label: string; description?: string; icon?: string; meta?: string }; first: boolean }> = ({ item, first }) => {
  const t = useTheme();
  const target = useTarget(item.id);
  return (
    <div {...target} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 22px", borderTop: first ? "none" : `${t.ui.borderWidth}px solid ${t.ui.border}` }}>
      {item.icon ? (
        <div style={{ width: 48, height: 48, borderRadius: t.ui.radiusSm, background: t.ui.primarySoft, color: t.ui.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={item.icon} size={26} />
        </div>
      ) : null}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: t.ui.fontSize * 0.92, fontWeight: 600, color: t.ui.text }}>{item.label}</div>
        {item.description ? <div style={{ fontSize: t.ui.fontSize * 0.76, color: t.ui.muted }}>{item.description}</div> : null}
      </div>
      {item.meta ? <div style={{ fontSize: t.ui.fontSize * 0.76, color: t.ui.muted }}>{item.meta}</div> : null}
      <Icon name="chevron-right" size={24} color={t.ui.muted} />
    </div>
  );
};

export const SettingRow: React.FC<{ id: string; label: string; description?: string; control?: React.ReactNode }> = ({ id, label, description, control }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "6px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <div style={{ fontSize: t.ui.fontSize * 0.95, fontWeight: 600, color: t.ui.text }}>{label}</div>
        {description ? <div style={{ fontSize: t.ui.fontSize * 0.78, color: t.ui.muted, lineHeight: 1.35 }}>{description}</div> : null}
      </div>
      {control}
    </div>
  );
};

export const Progress: React.FC<{ label?: string; value: number; id?: string }> = ({ label, value, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {label ? (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: t.ui.fontSize * 0.82, color: t.ui.text }}>
          <span>{label}</span>
          <span style={{ color: t.ui.muted }}>{Math.round(value)}%</span>
        </div>
      ) : null}
      <div style={{ height: 14, borderRadius: 14, background: t.ui.surfaceAlt, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 14, background: t.ui.primary }} />
      </div>
    </div>
  );
};

export const Chart: React.FC<{ variant: "bar" | "line"; values: number[]; label?: string; id?: string }> = ({ variant, values, label, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  const max = Math.max(...values, 1);
  const w = 600;
  const h = 180;
  return (
    <div {...target} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {label ? <div style={{ fontSize: t.ui.fontSize * 0.82, color: t.ui.muted, fontWeight: 500 }}>{label}</div> : null}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h }} preserveAspectRatio="none">
        {variant === "bar"
          ? values.map((v, i) => {
              const bw = w / values.length;
              const bh = (v / max) * (h - 10);
              return <rect key={i} x={i * bw + bw * 0.18} y={h - bh} width={bw * 0.64} height={bh} rx={8} fill={i === values.length - 1 ? t.ui.primary : t.ui.primarySoft} />;
            })
          : (() => {
              const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 16) - 6}`).join(" ");
              return (
                <>
                  <polyline points={`0,${h} ${pts} ${w},${h}`} fill={t.ui.primarySoft} stroke="none" />
                  <polyline points={pts} fill="none" stroke={t.ui.primary} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
                </>
              );
            })()}
      </svg>
    </div>
  );
};

export const Media: React.FC<{ label?: string; aspect?: number; icon?: string; id?: string }> = ({ label, aspect = 16 / 9, icon = "image", id }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div
      {...target}
      style={{
        aspectRatio: String(aspect),
        width: "100%",
        borderRadius: t.ui.radius,
        background: `linear-gradient(135deg, ${t.ui.primarySoft}, ${t.ui.surfaceAlt})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: t.ui.primary,
      }}
    >
      <Icon name={icon} size={48} />
      {label ? <div style={{ fontSize: t.ui.fontSize * 0.8, color: t.ui.muted }}>{label}</div> : null}
    </div>
  );
};

export const EmptyState: React.FC<{ title: string; description?: string; icon?: string; action?: React.ReactNode; id?: string }> = ({ title, description, icon = "sparkles", action, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ ...cardStyle(t), padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
      <div style={{ width: 84, height: 84, borderRadius: 84, background: t.ui.primarySoft, color: t.ui.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={42} />
      </div>
      <div style={{ fontSize: t.ui.fontSize * 1.1, fontWeight: 700, color: t.ui.text }}>{title}</div>
      {description ? <div style={{ fontSize: t.ui.fontSize * 0.85, color: t.ui.muted, maxWidth: 520 }}>{description}</div> : null}
      {action}
    </div>
  );
};

export const Skeleton: React.FC<{ lines?: number; height?: number; id?: string }> = ({ lines = 3, height = 22, id }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{ height, width: `${[92, 76, 84, 60, 70][i % 5]}%`, borderRadius: height, background: t.ui.surfaceAlt }} />
      ))}
    </div>
  );
};

export const Divider: React.FC = () => {
  const t = useTheme();
  return <div style={{ height: t.ui.borderWidth, background: t.ui.border, width: "100%" }} />;
};

/** Mix two hex colors (#rrggbb). */
export function mix(a: string, b: string, p: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return p > 0.5 ? b : a;
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * p));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function parseHex(h: string): number[] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
