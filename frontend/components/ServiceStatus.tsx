"use client";
import { useEffect, useState } from "react";

type Status = {
  core: "ok" | "error";
  grm: "ok" | "error";
  frontend: "ok" | "error";
};

export default function ServiceStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ core: "error", grm: "error", frontend: "ok" }));
  }, []);

  if (!status) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {(["core", "grm", "frontend"] as const).map((svc) => (
        <div key={svc} className="flex items-center gap-2">
          <span
            className={`sa-dot ${
              status[svc] === "ok" ? "sa-dot-ok sa-dot-live" : "sa-dot-err"
            }`}
          />
          <span className="text-xs capitalize text-[var(--sa-text-tertiary)]">
            {svc}
          </span>
        </div>
      ))}
    </div>
  );
}
