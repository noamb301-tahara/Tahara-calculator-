import React, { useMemo } from "react";
import type { Overlay, ScreenDefinition, ScreenElement } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import type { ScreenRuntime } from "../engine/runtime";
import { initialRuntime } from "../engine/runtime";
import { ScreenContextProvider, useScreenContext } from "./context";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chart,
  Checkbox,
  Divider,
  Dropdown,
  EmptyState,
  IconButton,
  Input,
  List,
  Media,
  MetricCard,
  Progress,
  RadioGroup,
  SettingRow,
  Skeleton,
  Table,
  Tabs,
  Text,
  Toggle,
  ToggleSwitch,
} from "./primitives";
import { AnchoredMenu, BrowserFrame, Dialog, MobileFrame, PageHeader, Sidebar, Toast, Topbar, WindowFrame } from "./shell";

/**
 * Renders any ScreenDefinition + runtime state. This is the single UI engine
 * behind every reconstructed screen.
 */
export const ScreenRenderer: React.FC<{ screen: ScreenDefinition; runtime?: ScreenRuntime; measurable?: boolean }> = ({ screen, runtime, measurable = true }) => {
  const t = useTheme();
  const rt = runtime ?? initialRuntime(screen);
  const menusByAnchor = useMemo(() => {
    const m: Record<string, Extract<Overlay, { kind: "menu" }>> = {};
    for (const o of screen.overlays) if (o.kind === "menu") m[o.anchor] = o;
    return m;
  }, [screen]);

  const body = (
    <div style={{ position: "absolute", inset: 0, display: "flex", background: t.ui.bg, fontFamily: t.fonts.ui, color: t.ui.text, direction: screen.direction, textAlign: screen.direction === "rtl" ? "right" : "left" }}>
      {screen.sidebar && screen.layout !== "centered" && screen.layout !== "blank" ? (
        <Sidebar items={screen.sidebar.items} footer={screen.sidebar.footer} appName={screen.app.name} logoText={screen.app.logoText} accent={screen.app.accentColor} sectionTitle={screen.sidebar.sectionTitle} />
      ) : null}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {screen.topbar && screen.layout !== "blank" ? (
          <Topbar
            title={screen.topbar.title}
            search={screen.topbar.search}
            user={screen.topbar.user}
            actions={screen.topbar.actions.map((el, i) => (
              <ElementView key={elKey(el, i)} el={el} />
            ))}
          />
        ) : null}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              padding: screen.layout === "centered" ? "60px 70px" : "34px 34px",
              display: "flex",
              flexDirection: "column",
              gap: 26,
              alignItems: screen.layout === "centered" ? "center" : "stretch",
              transform: `translateY(${-rt.scrollY}px)`,
            }}
          >
            {screen.header ? (
              <PageHeader
                title={screen.header.title}
                subtitle={screen.header.subtitle}
                breadcrumbs={screen.header.breadcrumbs}
                actions={
                  screen.header.actions.length
                    ? screen.header.actions.map((el, i) => <ElementView key={elKey(el, i)} el={el} />)
                    : null
                }
              />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 24, width: screen.layout === "centered" ? "100%" : undefined, maxWidth: screen.layout === "centered" ? 640 : undefined }}>
              {screen.content.map((el, i) => (
                <ElementView key={elKey(el, i)} el={el} />
              ))}
            </div>
          </div>
        </div>
        {screen.overlays.map((o) =>
          o.kind === "dialog" ? (
            <Dialog key={o.id} id={o.id} title={o.title} description={o.description} open={rt.overlays[o.id] ?? 0} actions={o.actions.length ? o.actions.map((el, i) => <ElementView key={elKey(el, i)} el={el} />) : null}>
              {o.body.map((el, i) => (
                <ElementView key={elKey(el, i)} el={el} />
              ))}
            </Dialog>
          ) : o.kind === "toast" ? (
            <Toast key={o.id} id={o.id} text={o.text} tone={o.tone} open={rt.overlays[o.id] ?? 0} />
          ) : null,
        )}
      </div>
    </div>
  );

  const framed =
    screen.frame === "browser" ? (
      <BrowserFrame url={screen.browser?.url} tabTitle={screen.browser?.tabTitle}>
        {body}
      </BrowserFrame>
    ) : screen.frame === "window" ? (
      <WindowFrame title={screen.app.name}>{body}</WindowFrame>
    ) : screen.frame === "mobile" ? (
      <MobileFrame>{body}</MobileFrame>
    ) : (
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: t.ui.radius, overflow: "hidden" }}>{body}</div>
    );

  return <ScreenContextProvider value={{ screen, rt, menusByAnchor, measurable }}>{framed}</ScreenContextProvider>;
};

function elKey(el: ScreenElement, i: number): string {
  return "id" in el && el.id ? el.id : `${el.kind}-${i}`;
}

/** Wraps an element so a menu anchored to it renders next to it. */
const WithMenu: React.FC<{ id?: string; children: React.ReactNode; inline?: boolean }> = ({ id, children, inline }) => {
  const { menusByAnchor } = useScreenContext();
  const menu = id ? menusByAnchor[id] : undefined;
  if (!menu) return <>{children}</>;
  return (
    <div style={{ position: "relative", display: inline ? "inline-flex" : "block" }}>
      {children}
      <AnchoredMenu menu={menu} />
    </div>
  );
};

const ElementView: React.FC<{ el: ScreenElement }> = ({ el }) => {
  const { rt } = useScreenContext();
  switch (el.kind) {
    case "text":
      return <Text id={el.id} text={el.text} variant={el.variant} />;
    case "button":
      return (
        <WithMenu id={el.id} inline>
          <Button id={el.id} label={el.label} variant={el.variant} icon={el.icon} size={el.size} />
        </WithMenu>
      );
    case "icon_button":
      return (
        <WithMenu id={el.id} inline>
          <IconButton id={el.id} icon={el.icon} label={el.label} />
        </WithMenu>
      );
    case "input":
      return (
        <Input
          id={el.id}
          label={el.label}
          placeholder={el.placeholder}
          value={rt.values[el.id] ?? el.value}
          inputType={el.inputType}
          helper={el.helper}
          multiline={el.multiline}
          typing={rt.typing === el.id}
          focused={rt.typing === el.id || rt.values[el.id] !== undefined}
        />
      );
    case "dropdown":
      return <Dropdown id={el.id} label={el.label} value={rt.selections[el.id] ?? el.value} options={el.options} open={rt.dropdownOpen[el.id] ?? 0} hover={rt.dropdownHover[el.id]} />;
    case "toggle":
      return <Toggle id={el.id} label={el.label} description={el.description} on={rt.toggles[el.id] ?? el.on} anim={rt.toggleAnim[el.id] ?? 1} />;
    case "checkbox":
      return <Checkbox id={el.id} label={el.label} description={el.description} checked={rt.toggles[el.id] ?? el.checked} anim={rt.toggleAnim[el.id] ?? 1} />;
    case "radio_group":
      return <RadioGroup id={el.id} label={el.label} value={rt.selections[el.id] ?? el.value} options={el.options} />;
    case "metric":
      return <MetricCard id={el.id} label={el.label} value={el.value} delta={el.delta} trend={el.trend} />;
    case "card":
      return (
        <WithMenu id={el.id}>
          <Card id={el.id} title={el.title} subtitle={el.subtitle} actions={el.actions?.length ? el.actions.map((a, i) => <ElementView key={elKey(a, i)} el={a} />) : null}>
            {el.children.map((c, i) => (
              <ElementView key={elKey(c, i)} el={c} />
            ))}
          </Card>
        </WithMenu>
      );
    case "table":
      return <Table id={el.id} columns={el.columns} rows={el.rows} />;
    case "tabs":
      return <Tabs id={el.id} tabs={el.tabs} active={rt.selections[el.id] ?? el.active} />;
    case "list":
      return <List id={el.id} items={el.items} />;
    case "setting_row": {
      let control: React.ReactNode = null;
      if (el.control) {
        const c = el.control;
        control =
          c.kind === "toggle" ? (
            <ToggleSwitch id={c.id} on={rt.toggles[c.id] ?? rt.toggles[el.id] ?? c.on} anim={rt.toggleAnim[c.id] ?? rt.toggleAnim[el.id] ?? 1} />
          ) : (
            <ElementView el={c} />
          );
      }
      return (
        <WithMenu id={el.id}>
          <SettingRow id={el.id} label={el.label} description={el.description} control={control} />
        </WithMenu>
      );
    }
    case "row":
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: el.wrap ? "wrap" : "nowrap",
            gap: el.gap ?? 16,
            alignItems: el.align === "start" ? "flex-start" : el.align === "end" ? "flex-end" : el.align === "stretch" ? "stretch" : "center",
            justifyContent: el.justify === "between" ? "space-between" : el.justify === "end" ? "flex-end" : el.justify === "center" ? "center" : "flex-start",
          }}
        >
          {el.children.map((c, i) => (
            <ElementView key={elKey(c, i)} el={c} />
          ))}
        </div>
      );
    case "stack":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: el.gap ?? 16 }}>
          {el.children.map((c, i) => (
            <ElementView key={elKey(c, i)} el={c} />
          ))}
        </div>
      );
    case "grid":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${el.columns}, minmax(0, 1fr))`, gap: el.gap ?? 18 }}>
          {el.children.map((c, i) => (
            <ElementView key={elKey(c, i)} el={c} />
          ))}
        </div>
      );
    case "divider":
      return <Divider />;
    case "badge":
      return <Badge id={el.id} text={el.text} tone={el.tone} />;
    case "avatar":
      return <Avatar id={el.id} name={el.name} size={el.size} />;
    case "media":
      return <Media id={el.id} label={el.label} aspect={el.aspect} icon={el.icon} />;
    case "empty_state":
      return <EmptyState id={el.id} title={el.title} description={el.description} icon={el.icon} action={el.action ? <ElementView el={el.action} /> : null} />;
    case "progress":
      return <Progress id={el.id} label={el.label} value={el.value} />;
    case "chart":
      return <Chart id={el.id} variant={el.variant} values={el.values} label={el.label} />;
    case "spacer":
      return <div style={{ height: el.size, flexShrink: 0 }} />;
    case "skeleton":
      return <Skeleton id={el.id} lines={el.lines} height={el.height} />;
  }
};
