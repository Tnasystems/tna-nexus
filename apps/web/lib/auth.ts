export type AppSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: {
    sub: string;
    email: string;
    role: string;
    companyId?: string;
    tenantSlug?: string;
    sessionId?: string;
  };
};

export type LoginPayload = {
  email: string;
  password: string;
  tenantSlug?: string;
};

const SESSION_STORAGE_KEY = "tna-nexus.session";

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return window.atob(padded);
}

function decodeAccessToken(token: string): AppSession["user"] {
  const parts = token.split(".");

  if (parts.length < 2) {
    throw new Error("Access token format is invalid.");
  }

  return JSON.parse(base64UrlDecode(parts[1])) as AppSession["user"];
}

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
  }

  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  const { hostname, origin } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:4000";
  }

  return origin;
}

export async function login(payload: LoginPayload): Promise<AppSession> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => null)) as
    | { accessToken?: string; refreshToken?: string; expiresIn?: string; message?: string }
    | null;

  if (!response.ok || !body?.accessToken || !body.refreshToken || !body.expiresIn) {
    throw new Error(body?.message ?? "Login failed. Check your credentials and try again.");
  }

  const session: AppSession = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresIn: body.expiresIn,
    user: decodeAccessToken(body.accessToken)
  };

  persistSession(session);
  return session;
}

export function persistSession(session: AppSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
