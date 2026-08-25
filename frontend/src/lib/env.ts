/**
 * Runtime environment resolution for Vite (Coolify API + Vercel SPA).
 *
 * Priority order:
 * 1. URL Query Parameter `?port=` or `?api_port=` (persisted in `sessionStorage` as `APP_PORT`)
 * 2. `sessionStorage` persisted `APP_PORT` (for SPA client-side router navigation)
 * 3. Environment variable `VITE_API_BASE_URL` (for Cloud deployments)
 * 4. Fallback default: `http://${hostname || "localhost"}:8000`
 */

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Public API base resolution.
 * Supports dynamic port detection for local development via ?port= parameter,
 * session storage persistence, environment variable VITE_API_BASE_URL, and fallback default.
 */
export function resolveApiBaseUrl(): string {
  // 1. Priority 1: Environment variable VITE_API_BASE_URL (used for Cloud deployments like Cloudflare / Vercel)
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

  // 2. Priority 2: URL query parameter ?port= or ?api_port= (for dynamic local dev override)
  if (typeof window !== "undefined") {
    try {
      const search = window.location.search;
      if (search) {
        const urlParams = new URLSearchParams(search);
        const queryPort = urlParams.get("port") || urlParams.get("api_port");
        if (queryPort && /^\d+$/.test(queryPort.trim())) {
          const port = queryPort.trim();
          sessionStorage.setItem("APP_PORT", port);
          const host = window.location.hostname || "localhost";
          return `http://${host}:${port}`;
        }
      }

      // Read persisted session port during local SPA route navigation (only on localhost/local IPs)
      const host = window.location.hostname || "localhost";
      const isLocalHost = host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.");
      if (isLocalHost) {
        const storedPort = sessionStorage.getItem("APP_PORT");
        if (storedPort && /^\d+$/.test(storedPort.trim())) {
          return `http://${host}:${storedPort.trim()}`;
        }
      }
    } catch {
      // Ignore storage/parsing errors
    }
  }

  // 3. Fallback default port
  const defaultHost =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localhost";
  return `http://${defaultHost}:8000`;
}

/**
 * Sentry tunnel path: always hits backend route POST /api/oversight
 */
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

/** Helper function to dynamically construct full API endpoint URLs per request */
export function joinApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = trimTrailingSlashes(resolveApiBaseUrl());
  if (!base || base === "/") {
    return p;
  }
  return `${base}${p}`;
}
