/* Tiny leveled logger. Replaces scattered console.* so log volume is
   controllable via LOG_LEVEL (error < warn < info < debug; default "info").
   Server-side only in practice; safe to import anywhere. Structured-ish output
   with a prefix so lines are greppable. */

type Level = "error" | "warn" | "info" | "debug";
const ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function threshold(): number {
  const env = (process.env.LOG_LEVEL || "info").toLowerCase() as Level;
  return ORDER[env] ?? ORDER.info;
}

function emit(level: Level, args: unknown[]) {
  if (ORDER[level] > threshold()) return;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn(`[${level}]`, ...args);
}

export const log = {
  error: (...a: unknown[]) => emit("error", a),
  warn: (...a: unknown[]) => emit("warn", a),
  info: (...a: unknown[]) => emit("info", a),
  debug: (...a: unknown[]) => emit("debug", a),
};
