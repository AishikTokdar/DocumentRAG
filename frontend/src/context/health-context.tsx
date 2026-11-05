import * as React from "react";
import { joinApiUrl } from "@/lib/constants";

export type HealthStatus = "connected" | "disconnected" | "checking";
interface HealthState {
  status: HealthStatus;
  isChecking: boolean;
  lastChecked: Date | null;
  consecutiveFailures: number;
}
const HealthContext = React.createContext<(HealthState & { checkNow: () => Promise<void> }) | null>(null);

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<HealthState>({ status: "checking", isChecking: false, lastChecked: null, consecutiveFailures: 0 });
  const retry = React.useRef<() => Promise<void>>(async () => {});
  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    let inFlight: Promise<void> | null = null;
    let connected = false;
    const check = (): Promise<void> => {
      if (stopped) return Promise.resolve();
      if (inFlight) return inFlight;
      clearTimeout(timer);
      active = new AbortController();
      const signal = AbortSignal.any([active.signal, AbortSignal.timeout(8_000)]);
      setState(previous => ({ ...previous, isChecking: true }));
      inFlight = (async () => {
        let ok = false;
        try {
          const response = await fetch(joinApiUrl("/health"), { signal, cache: "no-store" });
          const payload = await response.json();
          ok = response.ok && typeof payload === "object" && payload !== null && "status" in payload;
        } catch { /* empty */ }
        if (stopped) return;
        connected = ok;
        setState(previous => ({ status: ok ? "connected" : "disconnected", isChecking: false,
          lastChecked: new Date(), consecutiveFailures: ok ? 0 : previous.consecutiveFailures + 1 }));
      })().finally(() => {
        inFlight = null;
        active = null;
        if (!stopped) timer = setTimeout(poll, connected ? 45_000 : 12_000);
      });
      return inFlight;
    };
    const poll = () => {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 45_000);
      } else void check();
    };
    retry.current = check;
    const visibility = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visibility);
    poll();
    return () => {
      stopped = true;
      active?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const checkNow = React.useCallback(() => retry.current(), []);
  return <HealthContext.Provider value={{ ...state, checkNow }}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const context = React.useContext(HealthContext);
  if (!context) throw new Error("useHealth requires HealthProvider");
  return { ...context, isOffline: context.status === "disconnected" };
}
