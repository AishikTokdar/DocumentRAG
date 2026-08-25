import * as React from "react";
import { User, Bot, Copy, Check, FileText, Cpu, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isLatest?: boolean;
  index?: number;
  sources?: string[];
  modelUsed?: string;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const tokens = text.split(regex);

  return tokens.map((token, idx) => {
    if (token.startsWith("***") && token.endsWith("***") && token.length > 6) {
      return (
        <strong key={idx} className="font-bold italic text-stone-900 dark:text-stone-100">
          {token.slice(3, -3)}
        </strong>
      );
    }
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={idx} className="font-bold text-stone-900 dark:text-stone-100">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono text-xs"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      return <em key={idx}>{token.slice(1, -1)}</em>;
    }
    return token;
  });
}

function renderFormattedInlineText(text: string) {
  // Catch document citations in brackets: [Source: Filename - Page X] or [Filename - Page X] or [Page X]
  const citationRegex = /(\[(?:(?:Source:\s*)?[^\]]+\s*-\s*Page\s*\d+[^\]]*|Page\s*\d+[^\]]*)\])/gi;
  const parts = text.split(citationRegex);

  return parts.map((part, i) => {
    if (citationRegex.test(part)) {
      let cleanCitation = part.slice(1, -1).trim();
      // Strip any hallucinated chunk numbers (e.g., ", Chunk 2 & 3")
      cleanCitation = cleanCitation.replace(/,\s*Chunk.*$/i, "");
      return (
        <span
          key={i}
          className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 mx-1 my-0.5 rounded-md bg-lime-50 dark:bg-lime-950/40 text-lime-800 dark:text-lime-300 border border-lime-200 dark:border-lime-800/60 shadow-xs align-middle"
        >
          <FileText className="w-3 h-3 text-lime-600 dark:text-lime-400 shrink-0" />
          <span>{cleanCitation}</span>
        </span>
      );
    }

    return <span key={i}>{parseInlineMarkdown(part)}</span>;
  });
}

export function FormattedMessageContent({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let isNumbered = false;

  const flushList = (key: string) => {
    if (currentList.length > 0) {
      if (isNumbered) {
        elements.push(
          <ol key={key} className="list-decimal list-inside space-y-1.5 my-2 pl-2 text-stone-800 dark:text-stone-200">
            {currentList}
          </ol>
        );
      } else {
        elements.push(
          <ul key={key} className="list-disc list-inside space-y-1.5 my-2 pl-2 text-stone-800 dark:text-stone-200">
            {currentList}
          </ul>
        );
      }
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(`list-${index}`);
      elements.push(<div key={`blank-${index}`} className="h-2" />);
      return;
    }

    // Horizontal rules
    if (trimmed === "---" || trimmed === "***") {
      flushList(`list-${index}`);
      elements.push(<hr key={`hr-${index}`} className="my-4 border-stone-200 dark:border-stone-800" />);
      return;
    }

    // Headers
    if (trimmed.startsWith("###### ")) {
      flushList(`list-${index}`);
      elements.push(
        <h6 key={`h6-${index}`} className="text-xs font-bold text-stone-900 dark:text-stone-100 mt-2 mb-1 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(7))}
        </h6>
      );
      return;
    }
    if (trimmed.startsWith("##### ")) {
      flushList(`list-${index}`);
      elements.push(
        <h5 key={`h5-${index}`} className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-2 mb-1 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(6))}
        </h5>
      );
      return;
    }
    if (trimmed.startsWith("#### ")) {
      flushList(`list-${index}`);
      elements.push(
        <h4 key={`h4-${index}`} className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-3 mb-1 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(5))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith("### ")) {
      flushList(`list-${index}`);
      elements.push(
        <h3 key={`h3-${index}`} className="text-base font-bold text-stone-900 dark:text-stone-100 mt-3 mb-1.5 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(4))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList(`list-${index}`);
      elements.push(
        <h2 key={`h2-${index}`} className="text-base font-bold text-stone-900 dark:text-stone-100 mt-4 mb-2 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(3))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList(`list-${index}`);
      elements.push(
        <h1 key={`h1-${index}`} className="text-lg font-extrabold text-stone-900 dark:text-stone-100 mt-4 mb-2 tracking-tight">
          {renderFormattedInlineText(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    // Numbered list items like "1. ", "2. ", "3. "
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (currentList.length > 0 && !isNumbered) {
        flushList(`list-${index}`);
      }
      isNumbered = true;
      currentList.push(
        <li key={`li-${index}`} className="leading-relaxed">
          {renderFormattedInlineText(numMatch[2])}
        </li>
      );
      return;
    }

    // Bullet list items like "- ", "• ", "* "
    const bulletMatch = trimmed.match(/^[-•*]\s+(.*)/);
    if (bulletMatch) {
      if (currentList.length > 0 && isNumbered) {
        flushList(`list-${index}`);
      }
      isNumbered = false;
      currentList.push(
        <li key={`li-${index}`} className="leading-relaxed">
          {renderFormattedInlineText(bulletMatch[1])}
        </li>
      );
      return;
    }

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushList(`list-${index}`);
      elements.push(
        <hr key={`hr-${index}`} className="my-4 border-t border-stone-200 dark:border-stone-700/50" />
      );
      return;
    }

    // Normal paragraph line
    flushList(`list-${index}`);
    elements.push(
      <p key={`p-${index}`} className="leading-relaxed my-1">
        {renderFormattedInlineText(line)}
      </p>
    );
  });

  flushList("list-final");

  return <div className="space-y-1 text-sm sm:text-base leading-relaxed break-words">{elements}</div>;
}

export function ChatMessage({
  role,
  content,
  timestamp,
  isLatest: _isLatest = false,
  index: _index = 0,
  sources,
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
      return raw;
    });
  }, [sources]);

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
      {/* Avatar */}
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold border transition-colors",
          isUser
            ? "bg-amber-600 dark:bg-amber-500 text-white border-transparent"
            : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "relative max-w-[85%] sm:max-w-[75%] flex flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "px-4 py-3 rounded-2xl border leading-relaxed text-left transition-colors shadow-warm-sm",
            isUser
              ? "bg-stone-800 text-stone-100 dark:bg-stone-800 dark:text-stone-100 border-transparent rounded-tr-xs"
              : "bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-800 rounded-tl-xs",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <FormattedMessageContent content={content} />
          )}
        </div>

        {/* Source Citations */}
        {!isUser && formattedSources.length > 0 && (
          <div className="mt-2 w-full">
            <button
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
                  {formattedSources.map((src, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-lime-800 dark:text-lime-300 bg-lime-100 dark:bg-lime-950/80 rounded-md px-2 py-0.5 border border-lime-300 dark:border-lime-800/60 shadow-xs"
                    >
                      <FileText className="w-3 h-3 text-lime-600 dark:text-lime-400 shrink-0" />
                      {src}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Footer Meta */}
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
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 transition-all text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              aria-label="Copy message"
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
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 rounded-xl animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
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
                  className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce"
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
