import { createHistoryTransition } from "@/lib/history-transition";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  FileText,
  Trash2,
  Download,
  StopCircle,
  History,
  HardDrive,
  X,
  BookOpen,
  Key,
  FileType,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PDFUpload } from "./pdf-upload";
import { ChatMessage, TypingIndicator } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ModelSelector } from "./model-selector";
import { usePDFUpload } from "@/hooks/use-pdf-upload";
import { useChat } from "@/hooks/use-chat";
import { api } from "@/lib/api";
import { AI_MODELS, type AIModel, type ChatEntry } from "@/types";
import {
  loadPreference,
  savePreference,
  prefKeys,
  saveChatSession,
  loadChatSession,
  listChatSessions,
  deleteChatSession,
  clearAllSessions,
  type ChatSession,
} from "@/lib/storage";
import { getChatEntryReactKey } from "@/lib/chat-history";
import { ConfirmAlertDialog } from "@/components/ui/confirm-alert-dialog";

import { toast } from "sonner";
import { documentToPlainText, groupExportHeadings } from "@/lib/document-exports";
import { renderDocumentHtml } from "@/lib/document-rendering";

const DEFAULT_CHAT_MODEL_ID = AI_MODELS.find(m => m.isDefault)?.id ?? AI_MODELS[0].id;

function exportAsMarkdown(entries: ChatEntry[], title = "Conversation") {
  const content = entries.map(e => `## Question\n\n${e.question}\n\n## Answer\n\n${e.answer}`).join("\n\n---\n\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `${title.replace(/[^a-z0-9]/gi, "_")}.md`; link.click(); URL.revokeObjectURL(url);
}

async function exportAsTXT(chatHistory: ChatEntry[], activeSessionName?: string) {
  if (chatHistory.length === 0) return;
  const header = `DocumentRAG conversation\nDocument: ${activeSessionName || "Indexed PDF"}\nExported: ${new Date().toLocaleString()}\n\n`;

  const bodyTextPromises = chatHistory.map(async (e, idx) => {
    const plainTextAnswer = documentToPlainText(e.answer);
    let text = `Question ${idx + 1}\n${e.question}\n\nAnswer\n${plainTextAnswer}\n`;
    if (e.modelUsed) text += `\nModel Used: ${e.modelUsed}\n`;
    if (e.sources && e.sources.length) {
      text += `Citations:\n` + e.sources.map((s) => `  - ${s}`).join("\n") + "\n";
    }
    return text + "\n";
  });

  const bodyTexts = await Promise.all(bodyTextPromises);
  const body = bodyTexts.join("\n");
  const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(activeSessionName || "Conversation").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_report.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportAsPDF(chatHistory: ChatEntry[], activeSessionName?: string) {
  if (chatHistory.length === 0) return;

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const itemsHtmlArray = await Promise.all(
    chatHistory.map(async (e, idx) => {
      const parsedAnswer = await renderDocumentHtml(e.answer);
      return `
        <div class="message-card">
          <div class="question-box">Q${idx + 1}: ${escapeHtml(e.question)}</div>
          <div class="answer-box markdown-body">
            ${parsedAnswer}
            ${e.modelUsed ? `<div class="model-tag">Model: ${escapeHtml(e.modelUsed)}</div>` : ""}
            ${e.sources && e.sources.length
          ? `
              <div class="citations-box">
                <div class="citations-title">Document Citations:</div>
                ${e.sources.map((s) => `<div class="citation-item">- ${escapeHtml(s)}</div>`).join("")}
              </div>
            `
          : ""
        }
          </div>
        </div>
      `;
    })
  );

  const container = document.createElement("div");
  container.innerHTML = `
    <div id="pdf-export-container">
      <style>
        #pdf-export-container, #pdf-export-container * { color: #27272a !important; box-shadow: none !important; }
        #pdf-export-container * { background: transparent !important; }
        #pdf-export-container { background: #fff !important; }
        #pdf-export-container svg { display: none !important; }
        #pdf-export-container p, #pdf-export-container li { overflow-wrap: anywhere; }
        #pdf-export-container h1, #pdf-export-container h2, #pdf-export-container h3 { break-after: avoid; }
        #pdf-export-container table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        #pdf-export-container th, #pdf-export-container td { border: 1px solid #a8a29e; padding: 8px; overflow-wrap: anywhere; vertical-align: top; }
        #pdf-export-container tr { break-inside: avoid; }
        #pdf-export-container thead { display: table-header-group; }
        #pdf-export-container .answer-content { font-size: 13px; }
        #pdf-export-container .answer-table-scroll { overflow: visible; border: 0; }
        #pdf-export-container th, #pdf-export-container td { min-width: 0; }
        #pdf-export-container .answer-citation { display: inline; border: 0; padding: 0; margin: 0 4px; font-size: 10px; color: #57534e !important; }
        #pdf-export-container .answer-citation::before { content: "["; }
        #pdf-export-container .answer-citation::after { content: "]"; }
        #pdf-export-container .answer-table-hint { display: none; }

        #pdf-export-container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #18181b;
          padding: 20px 40px;
          background: #ffffff;
        }
        .header {
          border-bottom: 2px solid #e4e4e7;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .header h1 {
          font-size: 22px;
          font-weight: 800;
          color: #09090b;
          margin: 0 0 6px 0;
          letter-spacing: -0.5px;
        }
        .meta {
          font-size: 12px;
          color: #71717a;
          line-height: 1.5;
        }
        .message-card {
          margin-bottom: 24px;
          border: 1px solid #e4e4e7;
          border-radius: 12px;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .question-box {
          background: #f4f4f5;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 700;
          color: #18181b;
          border-bottom: 1px solid #e4e4e7;
        }
        .answer-box {
          padding: 16px;
          font-size: 13px;
          color: #27272a;
          white-space: normal;
        }
        .model-tag {
          margin-top: 12px;
          font-size: 11px;
          color: #71717a;
          font-weight: 600;
        }
        .citations-box {
          margin-top: 12px;
          padding: 12px;
          background: #fafafa;
          border-radius: 8px;
          border: 1px solid #f4f4f5;
          font-size: 11px;
        }
        .citations-title {
          font-weight: 700;
          color: #3f3f46;
          margin-bottom: 4px;
        }
        .citation-item {
          font-family: monospace;
          color: #52525b;
          margin-top: 2px;
        }
        .markdown-body {
          font-family: inherit;
        }
        .markdown-body a { color: #2563eb; text-decoration: underline; }
        .markdown-body p { margin-top: 0; margin-bottom: 12px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
          margin-top: 20px;
          margin-bottom: 12px;
          font-weight: 700;
          color: #09090b;
        }
        .markdown-body ul, .markdown-body ol {
          margin-top: 0;
          margin-bottom: 12px;
          padding-left: 24px;
        }
        .markdown-body li { margin-bottom: 6px; }
        .markdown-body code {
          background: #f4f4f5;
          padding: 2px 4px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12.5px;
        }
        .markdown-body pre {
          white-space: pre-wrap;
          background: #f4f4f5;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          font-family: monospace;
          font-size: 12.5px;
          margin-top: 0;
          margin-bottom: 12px;
        }
        .markdown-body strong { font-weight: 700; }
        .markdown-body em { font-style: italic; }
      </style>
      <div class="header">
        <h1>DocumentRAG Conversation Transcript</h1>
        <div class="meta">
          <strong>Document:</strong> ${escapeHtml(activeSessionName || "Indexed PDF")}<br/>
          <strong>Exported Date:</strong> ${new Date().toLocaleString()}<br/>
          <strong>Total Messages:</strong> ${chatHistory.length}
        </div>
      </div>
      ${itemsHtmlArray.join("")}
    </div>
  `;

  document.body.appendChild(container);
  container.style.position = "absolute";
  container.style.left = "-9999px";

  const targetElement = (container.firstElementChild || container) as HTMLElement;

  groupExportHeadings(targetElement);

  const opt = {
    margin: [10, 10, 20, 10] as [number, number, number, number],
    filename: `${activeSessionName || "Conversation"}_report.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h1', 'h2', 'h3', 'p', 'li'] },
    enableLinks: true
  };

  try {
    const { default: html2pdf } = await import("html2pdf.js");
    const pdfWorker = html2pdf()
      .from(targetElement)
      .set(opt)
      .toPdf();
    await pdfWorker.get('pdf')
      .then((pdf: { internal: { getNumberOfPages(): number; pageSize: { getWidth(): number; getHeight(): number } }; setPage(n: number): void; setFontSize(n: number): void; setTextColor(n: number): void; text(s: string, x: number, y: number): void }) => {
        const totalPages = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(10);
          pdf.setTextColor(150);
          pdf.text(
            `Page ${i} of ${totalPages}`,
            pdf.internal.pageSize.getWidth() - 30,
            pdf.internal.pageSize.getHeight() - 10
          );
        }
      });

    await pdfWorker.save();
  } catch (err: unknown) {
    console.error("PDF Export failed:", err);
    toast.error("PDF export failed. Please retry, or export Markdown or text.");
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
}

export function ChatContainer() {
  const followMessages = React.useRef(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesScrollRef = React.useRef<HTMLDivElement>(null);

  const [selectedModel, setSelectedModel] = React.useState(() =>
    loadPreference<string>(prefKeys.SELECTED_MODEL, DEFAULT_CHAT_MODEL_ID),
  );
  const [_modelMeta, setModelMeta] = React.useState(() => {
    const id = loadPreference<string>(prefKeys.SELECTED_MODEL, DEFAULT_CHAT_MODEL_ID);
    const m = AI_MODELS.find((x) => x.id === id) ?? AI_MODELS[0];
    return { name: m.name, provider: m.provider };
  });
  const [includeSources, setIncludeSources] = React.useState(() =>
    loadPreference<boolean>(prefKeys.INCLUDE_SOURCES, true),
  );
  const [hybridMode, setHybridMode] = React.useState(false);
  const [useStreaming, setUseStreaming] = React.useState(() =>
    loadPreference<boolean>(prefKeys.STREAMING_ENABLED, true),
  );
  const [showBanner, setShowBanner] = React.useState(
    () => !loadPreference<boolean>(prefKeys.DISMISSED_LOCAL_BANNER, false),
  );
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [showSessions, setShowSessions] = React.useState(false);
  const [clearAllOpen, setClearAllOpen] = React.useState(false);
  const [sessionToDelete, setSessionToDelete] = React.useState<string | null>(null);
  const [activeSessionName, setActiveSessionName] = React.useState<string | null>(null);

  const {
    isUploading,
    corpusId,
    isLoaded,
    fileName,
    chunksCreated,
    files,
    totalFiles,
    error: uploadError,
    uploadPDFs,
    reset: resetUpload,
  } = usePDFUpload();

  const {
    chatHistory,
    isLoading,
    error: chatError,
    streamingAnswer,
    statusMessage,
    failedDraft,
    sendMessage,
    sendMessageStreaming,
    clearHistory,
    cancelStream,
    setChatHistory,
  } = useChat();

  const historyName = fileName && corpusId ? `${fileName} [${corpusId.slice(0, 12)}]` : fileName;
  const viewingArchive = !!activeSessionName && activeSessionName !== historyName;
  React.useEffect(() => {
    savePreference(prefKeys.SELECTED_MODEL, selectedModel);
  }, [selectedModel]);
  React.useEffect(() => {
    savePreference(prefKeys.INCLUDE_SOURCES, includeSources);
  }, [includeSources]);
  React.useEffect(() => {
    savePreference(prefKeys.STREAMING_ENABLED, useStreaming);
  }, [useStreaming]);

  const historyRevision = React.useRef(createHistoryTransition());
  const historyReady = React.useRef(false);
  const [isRestoring, setIsRestoring] = React.useState(false);
  React.useEffect(() => {
    const revision = historyRevision.current.begin();
    let cancelled = false;
    historyReady.current = false;
    if (!historyName || !isLoaded) return;
    setIsRestoring(true);
    setActiveSessionName(historyName);
    void (async () => {
      const cleared = await clearHistory();
      if (cancelled || !cleared || !historyRevision.current.isCurrent(revision)) return;
      await historyRevision.current.restore(revision, () => loadChatSession(historyName), saved => {
        if (cancelled) return;
        setChatHistory(saved);
        historyReady.current = true;
      });
    })().finally(() => { if (!cancelled && historyRevision.current.isCurrent(revision)) setIsRestoring(false); });
    return () => { cancelled = true; };
  }, [historyName, isLoaded, clearHistory, setChatHistory]);

  React.useEffect(() => {
    const key = activeSessionName ?? historyName;
    if (historyReady.current && key && key === historyName && chatHistory.length > 0) {
      void saveChatSession(key, chatHistory);
    }
  }, [chatHistory, activeSessionName, historyName]);

  const handleClearConversation = async () => {
    const revision = historyRevision.current.begin();
    historyReady.current = false;
    setIsRestoring(true);
    try {
      if (viewingArchive) {
        cancelStream();
        setChatHistory([]);
      } else if (!await clearHistory()) return;
      if (activeSessionName) await deleteChatSession(activeSessionName);
      if (!historyRevision.current.isCurrent(revision)) return;
      historyReady.current = true;
      setSessions(await listChatSessions());
    } finally {
      if (historyRevision.current.isCurrent(revision)) setIsRestoring(false);
    }
  };

  React.useEffect(() => {
    listChatSessions().then(setSessions);
  }, [chatHistory, fileName, showSessions]);

  const scrollToBottom = React.useCallback(() => {
    const node = messagesScrollRef.current;
    if (node && followMessages.current) node.scrollTop = node.scrollHeight;
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [chatHistory, streamingAnswer, chatError, statusMessage, scrollToBottom]);

  const handleSendMessage = React.useCallback(
    (content: string) => {
      followMessages.current = true;
      if (useStreaming) {
        sendMessageStreaming(content, selectedModel, includeSources, hybridMode);
      } else {
        sendMessage(content, selectedModel, includeSources, hybridMode);
      }
    },
    [selectedModel, includeSources, hybridMode, useStreaming, sendMessageStreaming, sendMessage],
  );

  const handleRestoreSession = (s: ChatSession) => {
    historyRevision.current.begin();
    cancelStream();
    historyReady.current = s.pdfName === historyName;
    setChatHistory(s.entries);
    setActiveSessionName(s.pdfName);
  };

  const handleDeleteSession = async (name: string) => {
    const deletingVisible = activeSessionName === name;
    const revision = deletingVisible ? historyRevision.current.begin() : null;
    if (deletingVisible && !viewingArchive && isLoaded && !await clearHistory()) return;
    await deleteChatSession(name);
    const remaining = await listChatSessions();
    setSessions(remaining);
    if (revision !== null && historyRevision.current.isCurrent(revision)) {
      cancelStream();
      historyReady.current = false;
      await historyRevision.current.restore(revision,
        () => isLoaded && historyName && name !== historyName ? loadChatSession(historyName) : Promise.resolve([]),
        saved => {
          setChatHistory(saved);
          setActiveSessionName(isLoaded ? historyName : null);
          historyReady.current = isLoaded;
          setIsRestoring(false);
        });
    }
  };

  const handleClearAllConfirmed = async () => {
    const revision = historyRevision.current.begin();
    if (isLoaded && !await clearHistory()) return;
    await clearAllSessions();
    if (!historyRevision.current.isCurrent(revision)) return;
    cancelStream();
    setChatHistory([]);
    setSessions([]);
    setActiveSessionName(isLoaded ? historyName : null);
    historyReady.current = isLoaded;
    setIsRestoring(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="document-workspace w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-5"
    >
      <div className="workspace-title"><div><h1>Document workspace</h1><p>Add your documents, ask a question, and follow the sources.</p></div><span>{isLoaded ? `${totalFiles} document${totalFiles === 1 ? "" : "s"} ready` : "Start with a PDF"}</span></div>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <GlassCard padding="sm" className="border-stone-200 dark:border-stone-700">
              <div className="flex items-start justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <HardDrive className="w-4 h-4 shrink-0" />
                  <span>
                    Eligible documents can recover after a restart when server storage persists. Retention is configurable; saved conversations stay in this browser.
                  </span>
                </div>
                <button
                  onClick={() => {
                    setShowBanner(false);
                    savePreference(prefKeys.DISMISSED_LOCAL_BANNER, true);
                  }}
                  aria-label="Dismiss document storage note"
                  className="p-2 hover:bg-amber-500/20 rounded transition-colors text-amber-600 dark:text-amber-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <GlassCard padding="default" className="space-y-4 shadow-warm-sm border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-stone-500" />
                Your documents
              </h2>
              {isLoaded && (
                <Badge variant="success">Active</Badge>
              )}
            </div>

            <PDFUpload
              onUpload={async (nextFiles) => {
                cancelStream();
                setSessionError(null);
                await uploadPDFs(nextFiles);
              }}
              isUploading={isUploading}
              isLoaded={isLoaded}
              chunksCreated={chunksCreated ?? undefined}
              files={files}
              totalFiles={totalFiles}
              error={uploadError}
              onReset={async () => {
                cancelStream();
                setSessionError(null);
                try {
                  await api.deleteSession();
                  historyRevision.current.begin();
                  historyReady.current = false;
                  setIsRestoring(false);
                  resetUpload();
                  setChatHistory([]);
                  setActiveSessionName(null);
                } catch {
                  setSessionError("Could not remove the server documents. Please retry.");
                }
              }}
            />
            {sessionError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{sessionError}</p>}
          </GlassCard>

          <details className="workspace-settings"><summary>Answer preferences</summary>
            <GlassCard padding="default" className="space-y-4 shadow-warm-sm border-stone-200 dark:border-stone-800">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Answer settings
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5 block">
                    AI Model
                  </label>
                  <ModelSelector
                    value={selectedModel}
                    onChange={(m: AIModel) => {
                      setSelectedModel(m.id);
                      setModelMeta({ name: m.name, provider: m.provider });
                    }}
                  />
                </div>

                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold">
                        Knowledge Source Mode
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold border transition-colors",
                          hybridMode
                            ? "bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60"
                            : "bg-lime-50 dark:bg-lime-950/60 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800/60",
                        )}
                      >
                        {hybridMode ? "Hybrid Brain" : "Strict to Source"}
                      </span>
                    </label>

                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800">
                      <button
                        type="button"
                        aria-pressed={hybridMode}
                        onClick={() => setHybridMode(true)}
                        className={cn(
                          "flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                          hybridMode
                            ? "bg-white dark:bg-stone-800 text-orange-700 dark:text-orange-300 shadow-sm border border-orange-200 dark:border-orange-800/50 font-bold"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200",
                        )}
                      >
                        <span>Hybrid Brain</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={!hybridMode}
                        onClick={() => setHybridMode(false)}
                        className={cn(
                          "flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                          !hybridMode
                            ? "bg-white dark:bg-stone-800 text-lime-700 dark:text-lime-300 shadow-sm border border-lime-200 dark:border-lime-800/50 font-bold"
                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200",
                        )}
                      >
                        <span>Strict to Source</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                      {hybridMode
                        ? "Combines PDF citations with pretrained AI world knowledge."
                        : "Answers strictly using only the uploaded PDF document text."}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-2">
                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span className="text-stone-600 dark:text-stone-400">Stream Token Responses</span>
                      <input
                        type="checkbox"
                        checked={useStreaming}
                        onChange={(e) => setUseStreaming(e.target.checked)}
                        className="rounded border-stone-300 dark:border-stone-700 text-amber-500 focus:ring-amber-500/50"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs cursor-pointer">
                      <span className="text-stone-600 dark:text-stone-400">Include Citation Sources</span>
                      <input
                        type="checkbox"
                        checked={includeSources}
                        onChange={(e) => setIncludeSources(e.target.checked)}
                        className="rounded border-stone-300 dark:border-stone-700 text-amber-500 focus:ring-amber-500/50"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </GlassCard>

          </details>
          {sessions.length > 0 && (
            <GlassCard padding="sm" className="flex items-center justify-between shadow-warm-sm border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setShowSessions((p) => !p)}
                className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <History className="w-4 h-4 text-stone-500" />
                  Saved conversations ({sessions.length})
                </span>
                <Badge variant="outline" size="sm">{showSessions ? "Hide" : "Show"}</Badge>
              </button>
            </GlassCard>
          )}

          <AnimatePresence>
            {showSessions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <GlassCard padding="sm" className="space-y-2 shadow-warm-sm border-stone-200 dark:border-stone-800">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
                    <span className="text-xs font-semibold text-stone-500">History</span>
                    <button
                      onClick={() => setClearAllOpen(true)}
                      className="text-xs text-red-500 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {sessions.map((s) => (
                      <div
                        key={s.pdfName}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer",
                          s.pdfName === (activeSessionName ?? fileName)
                            ? "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-medium"
                            : "text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/50",
                        )}
                      >
                        <button type="button" onClick={() => handleRestoreSession(s)} className="min-h-10 truncate flex-1 text-left" title={s.pdfName}>{s.pdfName}</button>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] text-stone-400">{s.entries.length} msgs</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSessionToDelete(s.pdfName);
                            }}
                            aria-label={`Delete saved conversation ${s.pdfName}`}
                            className="p-2 text-stone-500 hover:text-red-500 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="conversation-panel min-w-0 lg:col-span-9 flex flex-col h-[75vh] min-h-[500px] rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden shadow-warm-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-stone-500" />
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                {activeSessionName ? activeSessionName.replace(/ \[[^\]]+\]$/, "") : "Conversation"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isLoading && !isRestoring && (
                <Button variant="ghost" size="sm" onClick={() => cancelStream(true)} className="text-xs text-red-500">
                  <StopCircle className="w-3.5 h-3.5 mr-1" />
                  Stop
                </Button>
              )}
              {chatHistory.length > 0 && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExportMenu((p) => !p)}
                    className="text-xs h-8 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 mr-1 text-stone-500" />
                    Export Chat
                  </Button>

                  <AnimatePresence>
                    {showExportMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute right-0 mt-1 w-44 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-lg p-1.5 z-50 text-xs space-y-1"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            exportAsTXT(chatHistory, activeSessionName || fileName || undefined);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium transition-colors cursor-pointer text-left"
                        >
                          <FileType className="w-3.5 h-3.5 text-amber-500" />
                          Export as Text (.txt)
                        </button>
                        <button type="button" onClick={() => { setShowExportMenu(false); exportAsMarkdown(chatHistory, fileName ?? undefined); }} className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800">Export as Markdown (.md)</button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            exportAsPDF(chatHistory, activeSessionName || fileName || undefined);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium transition-colors cursor-pointer text-left"
                        >
                          <FileText className="w-3.5 h-3.5 text-red-500" />
                          Export as PDF (.pdf)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {chatHistory.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClearConversation} aria-label="Clear conversation" className="text-xs text-stone-500 h-8">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div
            ref={messagesScrollRef}
            onScroll={() => { const node = messagesScrollRef.current; if (node) followMessages.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140; }}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
          >
            {chatHistory.length === 0 && !streamingAnswer && !isLoading ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6"
              >
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-800/40 shadow-xs">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    {isLoaded ? "Your documents are ready." : "A place to ask, read, and follow up."}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    {isLoaded
                      ? "Choose a starting question or ask about a detail you want to understand."
                      : "Add a PDF in Your documents to begin."}
                  </p>
                </div>

                {isLoaded && (
                  <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                    {[
                      {
                        icon: FileText, title: totalFiles > 1 ? "Summarize Documents" : "Summarize Document", prompt: totalFiles > 1
                          ? "Summarize each uploaded PDF in detail. Explain its purpose, important requirements, and practical implications."
                          : "Please provide a comprehensive summary of this entire document."
                      },
                      {
                        icon: Key, title: "Key Information", prompt: totalFiles > 1
                          ? "Identify the key information in each uploaded PDF. Explain the important facts, rules, and conditions."
                          : "What are the key findings, main points, and key information in this PDF?"
                      },
                      {
                        icon: BookOpen, title: "Explain Concepts", prompt: totalFiles > 1
                          ? "Explain the main concepts in each uploaded PDF in plain language. Show how the concepts relate to the procedures described in that PDF."
                          : "Explain the core topics and background concepts of this document in simple terms."
                      },
                      {
                        icon: FileText, title: "Action Items & Takeaways", prompt: totalFiles > 1
                          ? "Identify the action items and takeaways in each uploaded PDF. Explain who is responsible, when action is required, and how completion is confirmed where the document specifies it."
                          : "What are the main conclusions, action items, and practical takeaways from this document?"
                      },
                    ].map((item, i) => {
                      return (
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1, duration: 0.3 }}
                          key={i}
                          type="button"
                          onClick={() => handleSendMessage(item.prompt)}
                          className="flex flex-col items-start p-3 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-amber-200 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all text-left group shadow-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 leading-normal">
                            {item.prompt}
                          </p>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <>
                {chatHistory.map((entry, idx) => (
                  <React.Fragment key={getChatEntryReactKey(entry, idx)}>
                    <ChatMessage role="user" content={entry.question} timestamp={entry.timestamp} />
                    <ChatMessage
                      role="assistant"
                      content={entry.answer}
                      timestamp={entry.timestamp}
                      sources={entry.sources}
                      sourceDetails={entry.sourceDetails}
                      modelUsed={entry.modelUsed}
                    />
                  </React.Fragment>
                ))}

                {streamingAnswer !== null && streamingAnswer.length > 0 && (
                  <ChatMessage
                    role="assistant"
                    content={streamingAnswer}
                  />
                )}
                {isLoading && streamingAnswer && statusMessage && (
                  <p role="status" className="px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">{statusMessage}</p>
                )}

                {isLoading && (!streamingAnswer || streamingAnswer.length === 0) && (
                  <TypingIndicator statusMessage={statusMessage ?? undefined} />
                )}

                <div ref={messagesEndRef} />
              </>
            )}
            {chatError && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
                <span>{chatError}</span>
                <Button variant="ghost" size="sm" onClick={() => handleSendMessage(failedDraft?.text ?? chatHistory[chatHistory.length - 1]?.question ?? "")}>
                  Retry
                </Button>
              </div>
            )}

          </div>

          <div className="p-3 sm:p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50">
            {viewingArchive && <p role="status" className="px-4 text-sm text-amber-800 dark:text-amber-300">Saved conversation · Re-upload its matching documents to continue. You can still copy or export it.</p>}
            <ChatInput
              onSend={handleSendMessage}
              recoveryDraft={failedDraft}
              disabled={!isLoaded || isLoading || isRestoring || viewingArchive}
              placeholder={
                isLoaded
                  ? "Ask a question about the document..."
                  : "Upload a PDF document to enable chat..."
              }
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>

      <ConfirmAlertDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear All Sessions?"
        description="This will delete all saved chat history sessions stored on this device."
        confirmLabel="Clear All"
        onConfirm={handleClearAllConfirmed}
      />
      <ConfirmAlertDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => !open && setSessionToDelete(null)}
        title="Delete Session?"
        description={`Are you sure you want to delete session "${sessionToDelete}"?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (sessionToDelete) return handleDeleteSession(sessionToDelete);
        }}
      />
    </motion.div>
  );
}
