"use client";

import { useMemo, useState } from "react";

/* Small helper for admin review queues: text search + incremental "show more".
   Pass the items and a function that turns an item into searchable text. */
export function useQueueFilter<T>(
  items: T[],
  toText: (item: T) => string,
  pageSize = 10
) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => toText(it).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query]);

  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  return {
    query,
    setQuery,
    visible,
    hasMore,
    showMore: () => setLimit((l) => l + pageSize),
    total: filtered.length,
  };
}
