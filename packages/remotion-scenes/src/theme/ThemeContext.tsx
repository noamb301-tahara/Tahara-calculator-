import React, { createContext, useContext } from "react";
import type { StyleTokens } from "./presets";
import { getPreset } from "./presets";

const ThemeContext = createContext<StyleTokens>(getPreset("modern-saas"));

export const ThemeProvider: React.FC<{ tokens: StyleTokens; children: React.ReactNode }> = ({ tokens, children }) => (
  <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
);

export function useTheme(): StyleTokens {
  return useContext(ThemeContext);
}
