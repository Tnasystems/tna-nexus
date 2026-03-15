import { clearSession, getApiBaseUrl, readSession } from "./auth";

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const session = readSession();
  if (!session) {
    throw new Error("You are not signed in.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}/api/v1/${path}`, {
    ...init,
    headers
  });

  if (response.status === 401) {
    clearSession();
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? `Request failed for ${path}.`;
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  return body as T;
}
