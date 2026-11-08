import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useHealth } from "@/hooks/use-health";

export function BackendNotice() {
  const { isOffline, isChecking, checkNow } = useHealth();
  if (!isOffline) return null;
  return <div role="status" className="border-b border-amber-800/20 bg-amber-50 px-4 py-3 text-sm text-stone-800 dark:bg-stone-900 dark:text-stone-200">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex-1">The backend is unavailable. A hosted server may be waking up; retry shortly.</p>
      <button type="button" onClick={() => void checkNow()} disabled={isChecking} className="inline-flex items-center gap-2 underline underline-offset-4 disabled:opacity-50">
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isChecking ? "animate-spin motion-reduce:animate-none" : ""}`} />{isChecking ? "Checking…" : "Retry"}
      </button>
      <Link to="/api-status" className="underline underline-offset-4">API status</Link>
    </div>
  </div>;
}
