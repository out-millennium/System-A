"use client";

import { useEffect, useState, useCallback } from "react";
import type { ModerationStatus } from "@/lib/moderation";

/* Client hook: fetches the current user's live ban/mute status.
   • pollMs  — re-fetch on interval (apply admin actions to open tabs).
   • onFocus — re-fetch when the tab regains focus. */
export function useModeration(opts?: {
  pollMs?: number;
  onFocus?: boolean;
}): { status: ModerationStatus | null; loading: boolean } {
  const pollMs = opts?.pollMs ?? 0;
  const onFocus = opts?.onFocus ?? false;
  const [status, setStatus] = useState<ModerationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/moderation", { cache: "no-store" });
      setStatus(r.ok ? await r.json() : null);
    } catch {
      /* keep last status */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (active) fetchStatus();
    };
    run();
    let timer: ReturnType<typeof setInterval> | null = null;
    if (pollMs > 0) timer = setInterval(run, pollMs);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    if (onFocus) {
      document.addEventListener("visibilitychange", onVis);
      window.addEventListener("focus", run);
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      if (onFocus) {
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("focus", run);
      }
    };
  }, [fetchStatus, pollMs, onFocus]);

  return { status, loading };
}
