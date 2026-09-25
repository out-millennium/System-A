"use client";

/* ============================================================================
   System A — internationalisation (i18n)

   • Static, pre-authored translations only (no runtime machine translation).
   • Language is chosen client-side, persisted in localStorage + cookie, and
     restored automatically on reload.
   • Switching is instant (no page reload); a subtle fade is handled in the UI.
   • Default language is English.
   ========================================================================= */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import en, { type Messages } from "./messages/en";
import ru from "./messages/ru";
import zh from "./messages/zh";
import fr from "./messages/fr";
import es from "./messages/es";

export type Locale = "en" | "ru" | "zh" | "fr" | "es";

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ru", label: "Русский", short: "RU" },
  { code: "zh", label: "中文（简体）", short: "中文" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "es", label: "Español", short: "ES" },
];

const CATALOGUES: Record<Locale, Messages> = { en, ru, zh, fr, es };

const STORAGE_KEY = "sa-lang";

/* Resolve a dotted key ("landing.hero.lead") against a message object. */
function resolve(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

type Translate = (
  key: string,
  vars?: Record<string, string | number>
) => string;

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLocale(): Locale {
  if (typeof document === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && stored in CATALOGUES) return stored;
    const cookie = document.cookie.match(/(?:^|; )sa-lang=([^;]+)/)?.[1];
    if (cookie && cookie in CATALOGUES) return cookie as Locale;
  } catch {
    /* ignore */
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Server + first client render use "en" to avoid hydration mismatch;
  // the persisted choice is applied right after mount.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const initial = readInitialLocale();
    if (initial !== "en") setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.cookie = `sa-lang=${l};path=/;max-age=31536000;samesite=lax`;
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      const dict = CATALOGUES[locale] ?? en;
      let str = resolve(dict, key);
      if (str === undefined) str = resolve(en, key); // fallback to English
      if (str === undefined) return key; // last resort: show the key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if used outside the provider (renders English).
    return {
      locale: "en",
      setLocale: () => {},
      t: (key, vars) => {
        let str = resolve(en, key) ?? key;
        if (vars)
          for (const [k, v] of Object.entries(vars))
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        return str;
      },
    };
  }
  return ctx;
}

/* Convenience hook: const t = useT(); t("landing.hero.lead") */
export function useT(): Translate {
  return useI18n().t;
}
