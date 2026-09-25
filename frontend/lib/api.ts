const CORE_API_URL = process.env.CORE_API_URL!;
const CORE_ADMIN_KEY = process.env.CORE_ADMIN_KEY!;
import { signedCoreHeaders } from "@/lib/core-signature";

const adminHeaders = {
  "Content-Type": "application/json",
  "x-admin-key": CORE_ADMIN_KEY,
};

export async function createAccount(name: string) {
  const res = await fetch(`${CORE_API_URL}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();
}

export async function getBalance(accountId: string) {
  const res = await fetch(`${CORE_API_URL}/balance/${accountId}`, {
    headers: adminHeaders,
  });
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();
}

export async function getAccountLedger(accountId: string, apiKey: string, offset: number = 0, limit: number = 10) {
  const res = await fetch(
    `${CORE_API_URL}/ledger/${accountId}?limit=${limit}&offset=${offset}`,
    {
      headers: {
        ...adminHeaders,
        "x-api-key": apiKey,
      },
    }
  );
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();
}

export async function transfer(
  fromAccount: string,
  toAccount: string,
  amount: number,
  apiKey: string
) {
  const body = JSON.stringify({ from_account: fromAccount, to_account: toAccount, amount });
  const res = await fetch(`${CORE_API_URL}/transfer`, {
    method: "POST",
    headers: signedCoreHeaders(body, { ...adminHeaders, "x-api-key": apiKey }),
    body,
  });
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();
}

export async function burn(fromAccount: string, amount: number, apiKey: string) {
  const body = JSON.stringify({ from_account: fromAccount, amount });
  const res = await fetch(`${CORE_API_URL}/burn`, {
    method: "POST",
    headers: signedCoreHeaders(body, { ...adminHeaders, "x-api-key": apiKey }),
    body,
  });
  if (!res.ok) throw new Error((await res.json()).detail);
  return res.json();
}
