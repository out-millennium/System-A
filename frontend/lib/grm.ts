const GRM_SERVICE_URL = process.env.GRM_SERVICE_URL!;

export async function getLedgerSummary() {
  const res = await fetch(`${GRM_SERVICE_URL}/grm/ledger-summary`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch ledger summary");
  return res.json();
}

export async function computeGRM(rates: Record<string, number>, weights: Record<string, number>) {
  const res = await fetch(`${GRM_SERVICE_URL}/grm/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rates, weights }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to compute GRM");
  return res.json();
}
