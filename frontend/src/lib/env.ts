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
  // 1. Check browser runtime override in localStorage / sessionStorage
  if (typeof window !== "undefined") {
    try {
      const storageOverride =
        localStorage.getItem("VITE_API_BASE_URL") ||
        sessionStorage.getItem("VITE_API_BASE_URL");
      if (storageOverride && storageOverride.trim()) {
        return trimTrailingSlashes(storageOverride.trim());
      }
    } catch {
      // Ignore storage errors
    }
  }

  // 2. Check for URL query parameters: ?api_url= or ?api_base_url= or ?port=
  if (typeof window !== "undefined") {
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
    } catch {
      // Ignore parsing errors
    }
  }

  // 3. Check build-time environment variable VITE_API_BASE_URL
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

  // 4. Local dev environment resolution (only append port 8000 on localhost/LAN IPs)
  if (typeof window !== "undefined") {
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
    } catch {
      // Ignore errors
    }
  }

  // 5. Cloud deployment fallback when VITE_API_BASE_URL is not set:
  // Return empty string (relative calls) without hardcoded third-party domain URLs.
  return "";
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
