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
    if (res.status === 401)
      window.dispatchEvent(new Event("vestry-session-expired"));
    const body = await res
      .json()
      .catch(() => ({ error: "The server could not be reached." }));
    throw new Error(body.error || "Request failed.");
  }
  return res.json();
}
export const post = (path: string, body: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
export const patch = (path: string, body: unknown) =>
  api(path, { method: "PATCH", body: JSON.stringify(body) });
export type Row = Record<string, any>;
