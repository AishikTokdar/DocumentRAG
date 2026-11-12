import * as React from "react";
import { FormattedMessageContent } from "./answer-content";
import { User, Bot, Copy, Check, FileText, Cpu, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatRelativeTime, parsePageCitation } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { SourceDetail } from "@/types";

export interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isLatest?: boolean;
  index?: number;
  sources?: string[];
  sourceDetails?: SourceDetail[];
  modelUsed?: string;
}

export { FormattedMessageContent } from "./answer-content";

export function ChatMessage({
  role,
  content,
  timestamp,
  isLatest: _isLatest = false,
  index: _index = 0,
  sources,
  sourceDetails,
  modelUsed,
}: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const isUser = role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formattedSources = React.useMemo(() => {
    if (!sources) return [];
    return sources.map((src) => {
      const raw = String(src).trim();
      if (/^\d+$/.test(raw)) {
        const pageNum = Number.parseInt(raw, 10) + 1;
        return `Page ${pageNum}`;
      }
      return /^\[([^\]]+)\](?:\(https?:\/\/[^)]+\))?$/i.exec(raw)?.[1] ?? raw;
    });
  }, [sources]);

  const sourceNumbers = React.useMemo(() => {
    const numbers = new Map<string, number>();
    for (const label of formattedSources) {
      const citation = parsePageCitation(label);
      if (citation?.document && !numbers.has(citation.document)) {
        numbers.set(citation.document, numbers.size + 1);
      }
    }
    return numbers;
  }, [formattedSources]);

  const sourceDetailsMap = React.useMemo(() => {
    const map = new Map<string, SourceDetail>();
    if (!sourceDetails) return map;
    for (const d of sourceDetails) {
      if (d.citation) {
        map.set(d.citation, d);
        const bare = d.citation.replace(/^\[|\]$/g, "").trim();
        map.set(bare, d);
      }
      if (d.source_file) {
        map.set(d.source_file, d);
        if (d.page) {
          map.set(`${d.source_file} - Page ${d.page}`, d);
        }
      }
    }
    return map;
  }, [sourceDetails]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex gap-3 group text-sm sm:text-base",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          isUser ? "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold border transition-colors" : "hidden",
          isUser
            ? "bg-amber-600 dark:bg-amber-500 text-white border-transparent"
            : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div
        className={cn(
          isUser ? "relative max-w-[90%] sm:max-w-[80%] flex flex-col" : "answer-reading relative w-full min-w-0 flex flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            isUser ? "px-4 py-3 rounded-xl border leading-relaxed text-left" : "w-full min-w-0 py-2 leading-relaxed text-left",
            isUser
              ? "bg-stone-800 text-stone-100 dark:bg-stone-800 dark:text-stone-100 border-transparent rounded-tr-xs"
              : "text-stone-900 dark:text-stone-100",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <FormattedMessageContent content={content} sourceNumbers={sourceNumbers} sourceDetails={sourceDetailsMap} />
          )}
        </div>

        {!isUser && formattedSources.length > 0 && (
          <div className="mt-2 w-full">
            <button
              aria-expanded={sourcesOpen}
              onClick={() => setSourcesOpen((p) => !p)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{formattedSources.length} Source Citation{formattedSources.length > 1 ? "s" : ""}</span>
              {sourcesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <AnimatePresence>
              {sourcesOpen && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1.5 flex flex-wrap gap-1.5 overflow-hidden"
                >
                  {formattedSources.map((src, i) => {
                    const citation = parsePageCitation(src);
                    const number = citation && citation.document.length > 28
                      ? sourceNumbers.get(citation.document)
                      : undefined;
                    const detail = sourceDetailsMap.get(src) || (citation ? sourceDetailsMap.get(citation.document) : undefined);
                    const pill = (
                      <span
                        className="inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-[11px] font-semibold text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-700 rounded-md px-2 py-0.5 border border-stone-300 dark:border-stone-700 shadow-xs cursor-pointer transition-colors"
                      >
                        <FileText aria-hidden="true" className="w-3 h-3 text-stone-500 dark:text-stone-400 shrink-0" />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {number ? "Source " + number + " · " : ""}{src}
                        </span>
                      </span>
                    );
                    if (!detail) return <React.Fragment key={i}>{pill}</React.Fragment>;
                    return (
                      <TooltipProvider key={i} delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {pill}
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-xs sm:max-w-sm p-3 bg-stone-900 dark:bg-stone-950 text-stone-100 border border-stone-700/80 shadow-2xl rounded-xl">
                            <div className="space-y-1.5 text-left">
                              <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-400">
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{detail.source_file || src}</span>
                                {detail.page && <span className="text-stone-400 text-[11px] font-normal shrink-0">· Page {detail.page}</span>}
                              </div>
                              {detail.snippet && (
                                <p className="text-[11px] leading-relaxed text-stone-200 italic font-sans border-l-2 border-amber-500/50 pl-2 line-clamp-4">
                                  "{detail.snippet}"
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-2 mt-1.5 px-1 text-xs text-stone-400 dark:text-stone-500",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          {timestamp && <span>{formatRelativeTime(timestamp)}</span>}

          {!isUser && modelUsed && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-stone-100 dark:bg-stone-800/60 text-stone-600 dark:text-stone-400 rounded px-1.5 py-0.5 border border-stone-200/60 dark:border-stone-700/60 font-mono">
              <Cpu className="w-3 h-3" />
              {modelUsed.split("/").pop()}
            </span>
          )}

          {!isUser && (
            <button
              onClick={handleCopy}
              aria-label={copied ? "Answer copied" : "Copy answer"}
              className="opacity-100 p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-all text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-lime-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const TypingIndicator = React.forwardRef<
  HTMLDivElement,
  { streamingText?: string | null; statusMessage?: string | null }
>(function TypingIndicator({ streamingText, statusMessage }, ref) {
  const hasTokens = streamingText != null && streamingText.length > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      ref={ref} 
      className="space-y-2"
    >
      {statusMessage && (
        <div role="status" className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 px-3 py-2">
          <RefreshCw aria-hidden="true" className="w-3.5 h-3.5 motion-safe:animate-spin text-amber-500 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      <div className="flex gap-3 text-sm sm:text-base">
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
          <Bot className="w-4 h-4" />
        </div>

        <div className="bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 rounded-2xl rounded-tl-xs px-4 py-3 max-w-[85%] sm:max-w-[75%] shadow-warm-sm">
          {hasTokens ? (
            <FormattedMessageContent content={streamingText} />
          ) : (
            <span className="inline-flex items-center gap-1 align-middle" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full motion-safe:animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
});
TypingIndicator.displayName = "TypingIndicator";
