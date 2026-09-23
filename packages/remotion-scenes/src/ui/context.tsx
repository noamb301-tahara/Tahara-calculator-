import React, { createContext, useContext } from "react";
import type { Overlay, ScreenDefinition } from "@studio/shared";
import type { ScreenRuntime } from "../engine/runtime";

export interface ScreenContextValue {
  screen: ScreenDefinition;
  rt: ScreenRuntime;
  /** Menus keyed by the element they open from. */
  menusByAnchor: Record<string, Extract<Overlay, { kind: "menu" }>>;
  /** When false, data-el attributes are omitted (e.g. for a fading-out previous screen). */
  measurable: boolean;
}

const Ctx = createContext<ScreenContextValue | null>(null);

export const ScreenContextProvider: React.FC<{ value: ScreenContextValue; children: React.ReactNode }> = ({ value, children }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

export function useScreenContext(): ScreenContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScreenContext outside ScreenRenderer");
  return v;
}

/** Spread onto any targetable element. */
export function useTarget(id: string | undefined): { "data-el"?: string } {
  const ctx = useContext(Ctx);
  if (!id || !ctx?.measurable) return {};
  return { "data-el": id };
}

export function usePressed(id: string | undefined): boolean {
  const ctx = useContext(Ctx);
  return Boolean(id && ctx?.rt.pressed === id);
}
