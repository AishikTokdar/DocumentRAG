/**
 * Production uses the build-time API base or same-origin routing.
 * Development also supports browser overrides and a local port fallback.
 */

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    try {
      const storageOverride =
        localStorage.getItem("VITE_API_BASE_URL") ||
        sessionStorage.getItem("VITE_API_BASE_URL");
      if (storageOverride && storageOverride.trim()) {
        return trimTrailingSlashes(storageOverride.trim());
      }
    } catch { /* empty */ }
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    try {
      const search = window.location.search;
      if (search) {
        const urlParams = new URLSearchParams(search);
        const queryApiUrl = urlParams.get("api_url") || urlParams.get("api_base_url");
        if (queryApiUrl && queryApiUrl.trim()) {
          const cleanUrl = trimTrailingSlashes(queryApiUrl.trim());
          sessionStorage.setItem("VITE_API_BASE_URL", cleanUrl);
          return cleanUrl;
        }

        const queryPort = urlParams.get("port") || urlParams.get("api_port");
        if (queryPort && /^\d+$/.test(queryPort.trim())) {
          const port = queryPort.trim();
          sessionStorage.setItem("APP_PORT", port);
          const host = window.location.hostname || "localhost";
          return `http://${host}:${port}`;
        }
      }
    } catch { /* empty */ }
  }

  const raw = import.meta.env.VITE_API_BASE_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed) {
    if (trimmed.startsWith("/")) {
      const rel = trimTrailingSlashes(trimmed) || "/";
      if (rel !== "/") return rel;
    } else {
      return trimTrailingSlashes(trimmed);
    }
  }

  if (import.meta.env.DEV && typeof window !== "undefined") {
    try {
      const host = window.location.hostname || "localhost";
      const isLocalHost =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        host.endsWith(".local");

      if (isLocalHost) {
        const storedPort = sessionStorage.getItem("APP_PORT");
        if (storedPort && /^\d+$/.test(storedPort.trim())) {
          return `http://${host}:${storedPort.trim()}`;
        }
        return `http://${host}:8000`;
      }
    } catch { /* empty */ }
  }

  return "";
}

export function resolveSentryTunnelUrl(apiBaseUrl: string = resolveApiBaseUrl()): string {
  const base = trimTrailingSlashes(apiBaseUrl);
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}/api/oversight`;
  }
  if (base.startsWith("/")) {
    return `${base}/oversight`;
  }
  return `${base}/api/oversight`;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SENTRY_TUNNEL_URL = resolveSentryTunnelUrl(API_BASE_URL);

export function joinApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = trimTrailingSlashes(resolveApiBaseUrl());
  if (!base || base === "/") {
    return p;
  }
  return `${base}${p}`;
}
