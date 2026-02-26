import { ENV } from "./env";

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; token?: string; body?: any } = {}
): Promise<T> {
  const url = `${ENV.WEB_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === "string" ? data : (data?.error ?? "Request failed");
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }
  return data as T;
}
