export let csrf = "";
let parishId = "";
let changeReason = "";
export const setParish = (id: string) => {
  parishId = id;
};
export const setChangeReason = (reason: string) => {
  changeReason = reason;
};
export const parishQuery = () =>
  parishId ? "&parish_id=" + encodeURIComponent(parishId) : "";
export function setCsrf(v: string) {
  csrf = v;
}
export async function api(path: string, options: RequestInit = {}) {
  const form = options.body instanceof FormData;
  const res = await fetch("/api/v1" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(!form ? { "Content-Type": "application/json" } : {}),
      "X-CSRF-Token": csrf,
      ...(parishId ? { "X-Parish-Id": parishId } : {}),
      ...(changeReason ? { "X-Change-Reason": changeReason } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("vestry-session-expired"));
    const body = await res.json().catch(() => null);
    const fallback =
      res.status >= 500
        ? `The API is unavailable (HTTP ${res.status}). Open /api/v1/health for deployment details.`
        : `Request failed (HTTP ${res.status}).`;
    throw Object.assign(
      new Error(typeof body?.error === "string" ? body.error : fallback),
      { status: res.status, code: body?.code },
    );
  }
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The API returned an unexpected response. Check Vercel API routing at /api/v1/health.",
    );
  return res.json();
}
export const post = (path: string, body: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
export const patch = (path: string, body: unknown) =>
  api(path, { method: "PATCH", body: JSON.stringify(body) });
export type Row = Record<string, any>;
