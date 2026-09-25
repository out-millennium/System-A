"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "contrast";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = document.cookie.match(/theme=([^;]+)/)?.[1] as Theme | undefined;
    if (saved === "contrast" || saved === "dark") {
      // Explicit user choice always wins.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(saved);
      return;
    }
    // No explicit choice: follow the OS "increased contrast" preference as a
    // system-driven default (there is no light theme by design; this is the
    // faithful "system" affordance for this dark-first UI). Live-updates if the
    // OS setting changes while the app is open.
    const mq = window.matchMedia("(prefers-contrast: more)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(mq.matches ? "contrast" : "dark");
    const onChange = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "contrast" : "dark");
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  function toggle() {
    setTheme(t => {
      const next = t === "dark" ? "contrast" : "dark";
      document.cookie = `theme=${next};path=/;max-age=31536000`;
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div data-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
