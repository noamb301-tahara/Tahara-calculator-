import React from "react";
import type { MenuItem, NavItem, Overlay, Tone } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "../icons";
import { usePressed, useScreenContext, useTarget } from "./context";
import { Avatar, cardStyle, toneColor } from "./primitives";

/** Browser window chrome around the product UI. */
export const BrowserFrame: React.FC<{ url?: string; tabTitle?: string; children: React.ReactNode }> = ({ url, tabTitle, children }) => {
  const t = useTheme();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: t.ui.radius + 6, overflow: "hidden", boxShadow: t.ui.shadowLg, background: t.ui.bg, border: `${t.ui.borderWidth}px solid ${t.ui.border}` }}>
      <div style={{ height: 74, flexShrink: 0, background: t.ui.browserChrome, display: "flex", alignItems: "center", gap: 18, padding: "0 22px", direction: "ltr" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {["#ff6159", "#ffbd2e", "#28c941"].map((c) => (
            <div key={c} style={{ width: 16, height: 16, borderRadius: 16, background: c, opacity: 0.9 }} />
          ))}
        </div>
        <div style={{ flex: 1, height: 44, borderRadius: 12, background: t.ui.surface, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", color: t.ui.browserChromeText, fontSize: 20, overflow: "hidden", whiteSpace: "nowrap" }}>
          <Icon name="lock" size={18} color={t.ui.browserChromeText} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{url ?? tabTitle ?? ""}</span>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>{children}</div>
    </div>
  );
};

/** Desktop-app window chrome. */
export const WindowFrame: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => {
  const t = useTheme();
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: t.ui.radius + 4, overflow: "hidden", boxShadow: t.ui.shadowLg, background: t.ui.bg, border: `${t.ui.borderWidth}px solid ${t.ui.border}` }}>
      <div style={{ height: 56, flexShrink: 0, background: t.ui.browserChrome, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: t.ui.browserChromeText, fontSize: 20, fontWeight: 600 }}>
        <div style={{ position: "absolute", left: 20, display: "flex", gap: 10 }}>
          {["#ff6159", "#ffbd2e", "#28c941"].map((c) => (
            <div key={c} style={{ width: 15, height: 15, borderRadius: 15, background: c }} />
          ))}
        </div>
        {title}
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>{children}</div>
    </div>
  );
};

/** Phone frame for mobile-app tutorials. */
export const MobileFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTheme();
  return (
    <div style={{ height: "100%", aspectRatio: "9 / 17.5", margin: "0 auto", borderRadius: 64, padding: 16, background: "#0b0d12", boxShadow: t.ui.shadowLg }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", position: "relative", background: t.ui.bg }}>
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 150, height: 34, borderRadius: 34, background: "#0b0d12", zIndex: 5 }} />
        <div style={{ position: "absolute", inset: 0, paddingTop: 60 }}>{children}</div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC<{ items: NavItem[]; footer: NavItem[]; appName: string; logoText?: string; accent?: string; sectionTitle?: string }> = ({
  items,
  footer,
  appName,
  logoText,
  accent,
  sectionTitle,
}) => {
  const t = useTheme();
  return (
    <div style={{ width: 268, flexShrink: 0, background: t.ui.sidebarBg, borderRight: `${t.ui.borderWidth}px solid ${t.ui.border}`, display: "flex", flexDirection: "column", padding: "26px 16px", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 10px 22px" }}>
        <div style={{ width: 46, height: 46, borderRadius: t.ui.radiusSm + 2, background: accent ?? t.ui.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>
          {(logoText ?? appName).slice(0, 2)}
        </div>
        <div style={{ fontSize: 25, fontWeight: 700, color: t.ui.sidebarText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{appName}</div>
      </div>
      {sectionTitle ? <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: t.ui.sidebarMuted, padding: "6px 14px" }}>{sectionTitle}</div> : null}
      {items.map((it) => (
        <NavRow key={it.id} item={it} depth={0} />
      ))}
      <div style={{ flex: 1 }} />
      {footer.map((it) => (
        <NavRow key={it.id} item={it} depth={0} />
      ))}
    </div>
  );
};

const NavRow: React.FC<{ item: NavItem; depth: number }> = ({ item, depth }) => {
  const t = useTheme();
  const { rt, menusByAnchor } = useScreenContext();
  const target = useTarget(item.id);
  const pressed = usePressed(item.id);
  const active = rt.active ? rt.active === item.id : Boolean(item.active);
  const menu = menusByAnchor[item.id];
  return (
    <>
      <div style={{ position: "relative" }}>
        <div
          {...target}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: depth ? "11px 14px 11px 52px" : "13px 14px",
            borderRadius: t.ui.radiusSm,
            background: active ? t.ui.sidebarActiveBg : pressed ? t.ui.sidebarActiveBg : "transparent",
            color: active ? t.ui.sidebarActiveText : t.ui.sidebarText,
            fontSize: depth ? 21 : 23,
            fontWeight: active ? 650 : 500,
            transform: pressed ? "scale(0.97)" : "none",
          }}
        >
          {item.icon && !depth ? <Icon name={item.icon} size={26} /> : null}
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
          {item.badge ? <span style={{ fontSize: 16, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: t.ui.primary, color: t.ui.primaryText }}>{item.badge}</span> : null}
          {item.children?.length ? <Icon name={item.expanded ? "chevron-down" : "chevron-right"} size={20} color={t.ui.sidebarMuted} /> : null}
        </div>
        {menu ? <AnchoredMenu menu={menu} /> : null}
      </div>
      {item.expanded && item.children ? item.children.map((c) => <NavRow key={c.id} item={c} depth={depth + 1} />) : null}
    </>
  );
};

export const Topbar: React.FC<{
  title?: string;
  search?: { placeholder: string };
  user?: { name: string; id?: string };
  actions?: React.ReactNode;
  nav?: NavItem[];
  brand?: { name: string; logoText?: string; accent?: string } | null;
}> = ({ title, search, user, actions, nav, brand }) => {
  const t = useTheme();
  const searchTarget = useTarget(search ? "topbar-search" : undefined);
  const userId = user ? user.id ?? "topbar-user" : undefined;
  const userTarget = useTarget(userId);
  const { menusByAnchor } = useScreenContext();
  return (
    <div style={{ height: 88, flexShrink: 0, background: t.ui.topbarBg, borderBottom: `${t.ui.borderWidth}px solid ${t.ui.border}`, display: "flex", alignItems: "center", gap: 18, padding: "0 26px" }}>
      {brand ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginInlineEnd: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: t.ui.radiusSm + 2, background: brand.accent ?? t.ui.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20 }}>
            {(brand.logoText ?? brand.name).slice(0, 2)}
          </div>
          <div style={{ fontSize: 25, fontWeight: 800, color: t.ui.text, whiteSpace: "nowrap" }}>{brand.name}</div>
        </div>
      ) : null}
      {title ? <div style={{ fontSize: 25, fontWeight: 700, color: t.ui.text, whiteSpace: "nowrap" }}>{title}</div> : null}
      {nav?.length ? (
        <div style={{ display: "flex", alignItems: "stretch", gap: 6, height: "100%" }}>
          {nav.map((n) => (
            <TopNavItem key={n.id} item={n} />
          ))}
        </div>
      ) : null}
      {search ? (
        <div {...searchTarget} style={{ flex: 1, maxWidth: 420, height: 52, borderRadius: t.ui.radiusSm, background: t.ui.surfaceAlt, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", color: t.ui.muted, fontSize: 21 }}>
          <Icon name="search" size={22} />
          {search.placeholder}
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <div style={{ flex: search ? 0 : 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>
      {user ? (
        <div style={{ position: "relative" }}>
          <div {...userTarget}>
            <Avatar name={user.name} size={50} />
          </div>
          {userId && menusByAnchor[userId] ? <AnchoredMenu menu={menusByAnchor[userId]!} /> : null}
        </div>
      ) : null}
    </div>
  );
};

const TopNavItem: React.FC<{ item: NavItem }> = ({ item }) => {
  const t = useTheme();
  const { rt, menusByAnchor } = useScreenContext();
  const target = useTarget(item.id);
  const pressed = usePressed(item.id);
  const active = rt.active ? rt.active === item.id : Boolean(item.active);
  const menu = menusByAnchor[item.id];
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <div
        {...target}
        style={{
          padding: "10px 14px",
          fontSize: 22,
          fontWeight: active ? 700 : 500,
          color: active ? t.ui.primary : t.ui.muted,
          borderBottom: `4px solid ${active ? t.ui.primary : "transparent"}`,
          transform: pressed ? "scale(0.96)" : "none",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </div>
      {menu ? <AnchoredMenu menu={menu} /> : null}
    </div>
  );
};

export const PageHeader: React.FC<{ title: string; subtitle?: string; breadcrumbs?: string[]; actions?: React.ReactNode }> = ({ title, subtitle, breadcrumbs, actions }) => {
  const t = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {breadcrumbs?.length ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, color: t.ui.muted }}>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <Icon name="chevron-right" size={16} /> : null}
                <span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        ) : null}
        <div style={{ fontSize: t.ui.fontSize * 1.45, fontWeight: 750, color: t.ui.text, letterSpacing: -0.6 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: t.ui.fontSize * 0.85, color: t.ui.muted }}>{subtitle}</div> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>{actions}</div> : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overlays: Menu, Dialog, Toast, Tooltip
// ---------------------------------------------------------------------------

/** A menu rendered next to its anchor (no measuring needed). */
export const AnchoredMenu: React.FC<{ menu: Extract<Overlay, { kind: "menu" }> }> = ({ menu }) => {
  const { rt } = useScreenContext();
  const p = rt.overlays[menu.id] ?? 0;
  if (p <= 0.01) return null;
  const pos: React.CSSProperties =
    menu.placement === "bottom-end"
      ? { top: "calc(100% + 10px)", right: 0 }
      : menu.placement === "right-start"
        ? { top: 0, left: "calc(100% + 12px)" }
        : menu.placement === "left-start"
          ? { top: 0, right: "calc(100% + 12px)" }
          : menu.placement === "top-start"
            ? { bottom: "calc(100% + 10px)", left: 0 }
            : { top: "calc(100% + 10px)", left: 0 };
  return (
    <div style={{ position: "absolute", zIndex: 50, ...pos, opacity: p, transform: `translateY(${(1 - p) * -12}px) scale(${0.96 + 0.04 * p})`, transformOrigin: "top left" }}>
      <Menu id={menu.id} title={menu.title} items={menu.items} />
    </div>
  );
};

export const Menu: React.FC<{ id: string; title?: string; items: MenuItem[] }> = ({ id, title, items }) => {
  const t = useTheme();
  const target = useTarget(id);
  return (
    <div {...target} style={{ ...cardStyle(t), boxShadow: t.ui.shadowLg, minWidth: 330, padding: 8, display: "flex", flexDirection: "column" }}>
      {title ? <div style={{ fontSize: 18, fontWeight: 600, color: t.ui.muted, padding: "10px 16px 6px", textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</div> : null}
      {items.map((it) => (
        <React.Fragment key={it.id}>
          {it.dividerBefore ? <div style={{ height: t.ui.borderWidth, background: t.ui.border, margin: "6px 8px" }} /> : null}
          <MenuRow item={it} />
        </React.Fragment>
      ))}
    </div>
  );
};

const MenuRow: React.FC<{ item: MenuItem }> = ({ item }) => {
  const t = useTheme();
  const target = useTarget(item.id);
  const pressed = usePressed(item.id);
  return (
    <div
      {...target}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: t.ui.radiusSm - 2,
        fontSize: 22,
        color: item.danger ? t.ui.danger : t.ui.text,
        background: pressed ? t.ui.primarySoft : "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {item.icon ? <Icon name={item.icon} size={24} color={item.danger ? t.ui.danger : t.ui.muted} /> : null}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 500 }}>{item.label}</span>
        {item.description ? <span style={{ fontSize: 17, color: t.ui.muted }}>{item.description}</span> : null}
      </div>
      {item.shortcut ? <span style={{ fontSize: 17, color: t.ui.muted }}>{item.shortcut}</span> : null}
    </div>
  );
};

export const Dialog: React.FC<{ id: string; title: string; description?: string; open: number; children?: React.ReactNode; actions?: React.ReactNode }> = ({ id, title, description, open, children, actions }) => {
  const t = useTheme();
  const target = useTarget(id);
  if (open <= 0.01) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: `rgba(10,12,20,${0.42 * open})`, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div
        {...target}
        style={{ ...cardStyle(t), boxShadow: t.ui.shadowLg, width: "100%", maxWidth: 680, padding: 34, display: "flex", flexDirection: "column", gap: 22, opacity: open, transform: `translateY(${(1 - open) * 24}px) scale(${0.95 + 0.05 * open})` }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: t.ui.fontSize * 1.2, fontWeight: 700, color: t.ui.text }}>{title}</div>
          {description ? <div style={{ fontSize: t.ui.fontSize * 0.86, color: t.ui.muted, lineHeight: 1.4 }}>{description}</div> : null}
        </div>
        {children}
        {actions ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>{actions}</div> : null}
      </div>
    </div>
  );
};

export const Toast: React.FC<{ id: string; text: string; tone: Tone; open: number }> = ({ id, text, tone, open }) => {
  const t = useTheme();
  const target = useTarget(id);
  if (open <= 0.01) return null;
  const c = toneColor(t, tone);
  return (
    <div
      {...target}
      style={{
        position: "absolute",
        right: 28,
        bottom: 28,
        zIndex: 70,
        ...cardStyle(t),
        boxShadow: t.ui.shadowLg,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 24px",
        fontSize: 22,
        fontWeight: 600,
        color: t.ui.text,
        opacity: open,
        transform: `translateY(${(1 - open) * 30}px)`,
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 38, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={tone === "danger" ? "x" : tone === "warning" ? "warning" : "check"} size={22} strokeWidth={3} />
      </div>
      {text}
    </div>
  );
};

export const Tooltip: React.FC<{ text: string; visible: number }> = ({ text, visible }) => {
  if (visible <= 0.01) return null;
  return (
    <div style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: `translateX(-50%) translateY(${(1 - visible) * 6}px)`, opacity: visible, background: "#111", color: "#fff", fontSize: 18, padding: "8px 12px", borderRadius: 8, whiteSpace: "nowrap", zIndex: 80 }}>
      {text}
    </div>
  );
};
