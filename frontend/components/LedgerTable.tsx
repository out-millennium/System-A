"use client";
import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import Select from "@/components/Select";

type Operation = {
  operation_id: string;
  client_operation_id: string;
  operation_type: string;
  from_account: string | null;
  to_account: string | null;
  amount: string;
  timestamp: string;
};

const PAGE_SIZE = 10;

export default function LedgerTable({ account }: { account: string }) {
  const t = useT();
  const [ops, setOps] = useState<Operation[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ledger?offset=${off}`);
      const data = await res.json();
      setOps(data);
      setHasMore(data.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(offset);
  }, [offset, load]);

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  const filtered = ops
    .filter((op) => {
      if (filterType !== "all" && op.operation_type !== filterType)
        return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          op.operation_id.includes(q) ||
          (op.from_account?.toLowerCase().includes(q) ?? false) ||
          (op.to_account?.toLowerCase().includes(q) ?? false) ||
          String(op.amount).toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const diff =
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortAsc ? diff : -diff;
    });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder={t("ledger.search")}
          className="sa-input min-w-0 flex-1 !py-2 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-auto min-w-[9rem]"
          buttonClassName="!py-2 text-xs"
          ariaLabel={t("ledger.allTypes")}
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: "all", label: t("ledger.allTypes") },
            { value: "transfer", label: t("ledger.transfer") },
            { value: "burn", label: t("ledger.burn") },
            { value: "init_credit", label: t("ledger.initCredit") },
          ]}
        />
        <button
          onClick={() => setSortAsc((v) => !v)}
          className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-2 text-xs"
        >
          {sortAsc ? t("ledger.oldest") : t("ledger.newest")}
        </button>
        <a
          href="/api/ledger/export?format=csv"
          className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-2 text-xs"
        >
          {t("ledger.exportCsv")}
        </a>
        <a
          href="/api/ledger/export?format=json"
          className="sa-btn sa-btn-ghost !rounded-[var(--sa-r-sm)] !px-3 !py-2 text-xs"
        >
          {t("ledger.exportJson")}
        </a>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-[var(--sa-r-md)] bg-[var(--sa-surface-1)]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--sa-text-tertiary)]">
          {ops.length === 0 ? t("ledger.empty") : t("ledger.noResults")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line)]">
          {filtered.map((op) => {
            const isIncoming =
              op.to_account === account && op.operation_type !== "burn";
            const isExpanded = expanded === op.operation_id;
            return (
              <div
                key={op.operation_id}
                className="border-b border-[var(--sa-line)] bg-[var(--sa-surface-1)] last:border-b-0"
              >
                <button
                  onClick={() =>
                    setExpanded(isExpanded ? null : op.operation_id)
                  }
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--sa-surface-2)]"
                >
                  <span
                    className={`sa-dot ${
                      isIncoming ? "sa-dot-ok" : "sa-dot-err"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm capitalize text-[var(--sa-text)]">
                        {op.operation_type.replace("_", " ")}
                      </span>
                    </div>
                    <span className="sa-mono block truncate text-xs text-[var(--sa-text-quaternary)]">
                      {op.operation_id}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`sa-mono text-sm ${
                        isIncoming
                          ? "text-[var(--sa-ok)]"
                          : "text-[var(--sa-danger)]"
                      }`}
                    >
                      {isIncoming ? "+" : "−"}
                      {op.amount}
                    </span>
                    <span className="block text-[0.6875rem] text-[var(--sa-text-quaternary)]">
                      {new Date(op.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <span
                    className={`text-[var(--sa-text-quaternary)] transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-[var(--sa-line)] bg-[var(--sa-surface-0)] px-5 py-4 text-xs sm:grid-cols-2">
                        <Row label={t("ledger.type")} value={op.operation_type} />
                        {op.from_account && (
                          <Row label={t("ledger.from")} value={op.from_account} mono />
                        )}
                        {op.to_account && (
                          <Row label={t("ledger.to")} value={op.to_account} mono />
                        )}
                        <Row label={t("ledger.amount")} value={op.amount} mono />
                        <Row label={t("ledger.timestamp")} value={op.timestamp} />
                        {op.client_operation_id && (
                          <Row
                            label={t("ledger.clientId")}
                            value={op.client_operation_id}
                            mono
                          />
                        )}
                        <div className="sm:col-span-2">
                          <dt className="text-[var(--sa-text-quaternary)]">
                            {t("ledger.operationId")}
                          </dt>
                          <dd className="mt-1 flex items-center gap-2">
                            <span className="sa-mono break-all text-[var(--sa-text-secondary)]">
                              {op.operation_id}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyId(op.operation_id);
                              }}
                              className="sa-navlink flex-none text-[0.6875rem]"
                            >
                              {copied === op.operation_id ? t("ledger.copied") : t("ledger.copy")}
                            </button>
                          </dd>
                        </div>
                      </dl>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 pt-1">
        <button
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          className="sa-navlink text-sm disabled:opacity-25"
        >
          ← {t("ledger.previous")}
        </button>
        <span className="sa-mono text-xs text-[var(--sa-text-quaternary)]">
          {offset + 1}–{offset + ops.length}
        </span>
        <button
          disabled={!hasMore}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          className="sa-navlink text-sm disabled:opacity-25"
        >
          {t("ledger.next")} →
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[var(--sa-text-quaternary)]">{label}</dt>
      <dd
        className={`mt-0.5 break-all text-[var(--sa-text-secondary)] ${
          mono ? "sa-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
