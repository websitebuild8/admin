"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { ThemeSwitcher } from "./switcher";

function BrowserThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? "#11151b" : "#f7f8f5";
    // A manual app preference can differ from the device preference. Keep the
    // mobile browser/PWA chrome consistent with the chosen appearance too.
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content = color;
        meta.removeAttribute("media");
      });
  }, [resolvedTheme]);
  return null;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      storageKey="igo-appearance"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      <BrowserThemeColor />
      {children}
      <aside className="theme-fallback" aria-label="Appearance settings">
        <ThemeSwitcher />
      </aside>
    </ThemeProvider>
  );
}
