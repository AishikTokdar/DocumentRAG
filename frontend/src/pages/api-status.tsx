import * as React from "react";
import {
  Activity,
  BookOpen,
  ExternalLink,
  FileJson2,
  RefreshCw,
  Server,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { PageWrapper, SectionWrapper } from "@/components/layout/page-wrapper";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHealth } from "@/hooks/use-health";
import { fetchRuntimeSummary } from "@/lib/api";
import { resolveApiBaseUrl, joinApiUrl } from "@/lib/constants";
import type { RuntimeSummary } from "@/types";

export function ApiStatusPage() {
  const health = useHealth();
  const abortRef = React.useRef<AbortController | null>(null);
  const [data, setData] = React.useState<RuntimeSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async (isRefresh: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr(null);
    try {
      const d = await fetchRuntimeSummary({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(d);
    } catch (e) {
      if (controller.signal.aborted) return;
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const docsUrl = joinApiUrl("/redoc");

  return (
    <PageWrapper>
      <SectionWrapper className="desk-status">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-emerald-500" />
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                API status
              </h1>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              Base URL: {resolveApiBaseUrl() || "(Relative / Same-Origin)"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                <BookOpen className="w-3.5 h-3.5 mr-1" />
                OpenAPI Docs
                <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
              </a>
            </Button>
          </div>
        </div>

        <p className="mb-4 text-xs text-stone-500" role="status">Backend: {health.status}. Last checked: {health.lastChecked?.toLocaleTimeString() ?? "Pending"}. Provider configuration below is separate from verified model availability.</p>
        {err && (
          <GlassCard padding="default" className="mb-6 border-red-500/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300">
            <p role="alert" className="text-sm font-medium">Could not load the backend status: {err}</p>
            <p className="text-xs mt-1 opacity-80">
              Ensure <code className="font-mono bg-red-100 dark:bg-red-900/40 px-1 rounded">VITE_API_BASE_URL</code> is set in your Cloudflare Pages / Vercel environment variables, then rebuild the frontend. Backend CORS must allow this exact frontend origin.
            </p>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <GlassCard padding="default">
            <GlassCardContent className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>API Status</span>
                <Server className="w-4 h-4" />
              </div>
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Badge variant={data?.status === "ok" ? "success" : "warning"}>
                  {data?.status ?? (loading ? "Checking..." : "Unavailable")}
                </Badge>
              </div>
            </GlassCardContent>
          </GlassCard>

          <GlassCard padding="default">
            <GlassCardContent className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Default model</span>
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {data?.default_model ?? (loading ? "Checking..." : "Unavailable")}
              </div>
            </GlassCardContent>
          </GlassCard>

          <GlassCard padding="default">
            <GlassCardContent className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Chunk size</span>
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {data?.embedding_chunk_tokens != null ? `${data.embedding_chunk_tokens} tokens` : "Unavailable"}
              </div>
            </GlassCardContent>
          </GlassCard>

          <GlassCard padding="default">
            <GlassCardContent className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Chunk overlap</span>
                <FileJson2 className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {data?.embedding_overlap_tokens != null ? `${data.embedding_overlap_tokens} tokens` : "Unavailable"}
              </div>
            </GlassCardContent>
          </GlassCard>
        </div>

        {data?.providers_detail && data.providers_detail.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Configured Providers
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.providers_detail.map((provider) => (
                <GlassCard key={provider.id} padding="default">
                  <GlassCardContent className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                        {provider.display_name}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Status: {provider.status}
                      </p>
                    </div>
                    <Badge variant={provider.status === "working" ? "success" : provider.status === "partial" ? "warning" : "secondary"}>
                      {provider.status}
                    </Badge>
                  </GlassCardContent>
                </GlassCard>
              ))}
            </div>
          </div>
        )}
      </SectionWrapper>
    </PageWrapper>
  );
}
