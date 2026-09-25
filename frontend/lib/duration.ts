import type { Locale } from "@/lib/i18n";

/* Locale-aware "time remaining" formatter with correct plurals/declensions. */

function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function unit(locale: Locale, n: number, kind: "day" | "hour" | "minute"): string {
  if (locale === "ru") {
    if (kind === "day") return `${n} ${ruPlural(n, "день", "дня", "дней")}`;
    if (kind === "hour") return `${n} ${ruPlural(n, "час", "часа", "часов")}`;
    return `${n} ${ruPlural(n, "минуту", "минуты", "минут")}`;
  }
  if (locale === "zh") {
    const w = kind === "day" ? "天" : kind === "hour" ? "小时" : "分钟";
    return `${n} ${w}`;
  }
  if (locale === "fr") {
    if (kind === "day") return `${n} ${n === 1 ? "jour" : "jours"}`;
    if (kind === "hour") return `${n} ${n === 1 ? "heure" : "heures"}`;
    return `${n} ${n === 1 ? "minute" : "minutes"}`;
  }
  if (locale === "es") {
    if (kind === "day") return `${n} ${n === 1 ? "día" : "días"}`;
    if (kind === "hour") return `${n} ${n === 1 ? "hora" : "horas"}`;
    return `${n} ${n === 1 ? "minuto" : "minutos"}`;
  }
  if (kind === "day") return `${n} ${n === 1 ? "day" : "days"}`;
  if (kind === "hour") return `${n} ${n === 1 ? "hour" : "hours"}`;
  return `${n} ${n === 1 ? "minute" : "minutes"}`;
}

const LESS_THAN_MINUTE: Record<Locale, string> = {
  en: "less than a minute",
  ru: "меньше минуты",
  zh: "不到一分钟",
  fr: "moins d’une minute",
  es: "menos de un minuto",
};

export function formatRemaining(iso: string, locale: Locale): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return LESS_THAN_MINUTE[locale];
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(unit(locale, days, "day"));
  if (hours > 0) parts.push(unit(locale, hours, "hour"));
  if (days === 0 && minutes > 0) parts.push(unit(locale, minutes, "minute"));
  if (parts.length === 0) return LESS_THAN_MINUTE[locale];
  return parts.join(" ");
}
