/**
 * ChatContext
 *
 * Global context for chat state management.
 * Provides centralized state for PDF upload and chat functionality
 * across the application.  Now supports streaming and include_sources.
 *
 * Usage:
 * <ChatProvider>
 *   <YourApp />
 * </ChatProvider>
 *
 * const { isLoaded, sendMessage } = useChatContext();
 */

import * as React from "react";
import { api, ApiError, streamQuestion } from "@/lib/api";
import { createChatEntry } from "@/lib/chat-history";
import { AI_MODELS } from "@/types";
import type { ChatEntry, PDFDocument } from "@/types";

interface ChatContextState {
  pdfDocument: PDFDocument | null;
  isUploading: boolean;
  isPdfLoaded: boolean;
  chatHistory: ChatEntry[];
  isLoading: boolean;
  uploadError: string | null;
  chatError: string | null;
  selectedModel: string;
  includeSources: boolean;
  streamingEnabled: boolean;
  streamingAnswer: string | null;
}

interface ChatContextActions {
  uploadPDF: (file: File) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  resetPDF: () => void;
  setSelectedModel: (model: string) => void;
  setIncludeSources: (v: boolean) => void;
  setStreamingEnabled: (v: boolean) => void;
  cancelStream: () => void;
}

type ChatContextValue = ChatContextState & ChatContextActions;

const ChatContext = React.createContext<ChatContextValue | null>(null);

const initialState: ChatContextState = {
  pdfDocument: null,
  isUploading: false,
  isPdfLoaded: false,
  chatHistory: [],
  isLoading: false,
  uploadError: null,
  chatError: null,
  selectedModel: AI_MODELS.find(model => model.isDefault)?.id ?? AI_MODELS[0].id,
  includeSources: false,
  streamingEnabled: true,
  streamingAnswer: null,
};

interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [state, setState] = React.useState<ChatContextState>(initialState);
  const abortRef = React.useRef<AbortController | null>(null);
  const streamGenerationRef = React.useRef(0);

  React.useEffect(() => () => { streamGenerationRef.current += 1; abortRef.current?.abort(); }, []);

  const uploadPDF = React.useCallback(async (file: File) => {
    abortRef.current?.abort();
    const generation = ++streamGenerationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, isUploading: true, uploadError: null }));

    try {
      const response = await api.uploadPDFs([file], controller.signal);
      if (generation !== streamGenerationRef.current || controller.signal.aborted) return;

      const document: PDFDocument = {
        id: `pdf-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date(),
        chunksCreated: response.chunks_created,
      };

      setState((prev) => ({
        ...prev,
        pdfDocument: document,
        isUploading: false,
        isPdfLoaded: true,
        chatHistory: [],
        uploadError: null,
      }));
    } catch (error) {
      if (generation !== streamGenerationRef.current || controller.signal.aborted) return;
      const message =
        error instanceof ApiError ? error.detail : "Failed to upload PDF";

      setState((prev) => ({ ...prev, isUploading: false, uploadError: message }));
    }
  }, []);

  const sendMessage = React.useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const streamId = ++streamGenerationRef.current;

      setState((prev) => ({
        ...prev,
        isLoading: true,
        chatError: null,
        streamingAnswer: state.streamingEnabled ? "" : null,
      }));

      if (state.streamingEnabled) {
        let accumulated = "";

        const controller = streamQuestion(
          {
            question: message,
            model: state.selectedModel,
            include_sources: state.includeSources,
          },
          {
            onToken(text) {
              if (streamId !== streamGenerationRef.current) return;
              accumulated += text;
              setState((prev) => ({ ...prev, streamingAnswer: accumulated }));
            },
            onDone(meta) {
              if (streamId !== streamGenerationRef.current) return;
              const entry = createChatEntry({
                question: message,
                answer: meta.answer ?? accumulated,
                sources: meta.sources,
                modelUsed: meta.model_used,
              });
              setState((prev) => ({
                ...prev,
                chatHistory: [...prev.chatHistory, entry],
                isLoading: false,
                streamingAnswer: null,
              }));
            },
            onError(msg) {
              if (streamId !== streamGenerationRef.current) return;
              setState((prev) => ({
                ...prev,
                isLoading: false,
                chatError: msg,
                streamingAnswer: null,
              }));
            },
          },
        );
        abortRef.current = controller;
      } else {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const response = await api.askQuestion(
            message,
            state.selectedModel,
            state.includeSources,
            false,
            controller.signal,
          );
          if (streamId !== streamGenerationRef.current || controller.signal.aborted) return;

          const entry = createChatEntry({
            question: message,
            answer: response.answer,
            sources: response.sources,
            modelUsed: response.model_used,
          });

          setState((prev) => ({
            ...prev,
            chatHistory: [...prev.chatHistory, entry],
            isLoading: false,
          }));
        } catch (error) {
          if (streamId !== streamGenerationRef.current || controller.signal.aborted) return;
          const msg =
            error instanceof ApiError ? error.detail : "Failed to get response";
          setState((prev) => ({ ...prev, isLoading: false, chatError: msg }));
        }
      }
    },
    [state.selectedModel, state.includeSources, state.streamingEnabled],
  );

  const cancelStream = React.useCallback(() => {
    abortRef.current?.abort();
    streamGenerationRef.current += 1;
    setState((prev) => ({
      ...prev,
      isLoading: false,
      streamingAnswer: null,
    }));
  }, []);

  const clearChat = React.useCallback(async () => {
    abortRef.current?.abort();
    const generation = ++streamGenerationRef.current;
    try {
      await api.clearChatHistory();
      if (generation === streamGenerationRef.current) setState(previous => ({ ...previous, chatHistory: [], chatError: null, isLoading: false, streamingAnswer: null }));
    } catch { if (generation === streamGenerationRef.current) setState(previous => ({ ...previous, chatError: "Could not clear the server conversation. Please retry.", isLoading: false, streamingAnswer: null })); }
  }, []);

  const resetPDF = React.useCallback(async () => {
    abortRef.current?.abort();
    const generation = ++streamGenerationRef.current;
    try {
      await api.deleteSession();
      if (generation === streamGenerationRef.current) setState(initialState);
    } catch { if (generation === streamGenerationRef.current) setState(previous => ({ ...previous, chatError: "Could not delete the server session. Please retry.", isLoading: false, streamingAnswer: null })); }
  }, []);

  const setSelectedModel = React.useCallback((model: string) => {
    setState((prev) => ({ ...prev, selectedModel: model }));
  }, []);

  const setIncludeSources = React.useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, includeSources: v }));
  }, []);

  const setStreamingEnabled = React.useCallback((v: boolean) => {
    setState((prev) => ({ ...prev, streamingEnabled: v }));
  }, []);

  const value: ChatContextValue = {
    ...state,
    uploadPDF,
    sendMessage,
    clearChat,
    resetPDF,
    setSelectedModel,
    setIncludeSources,
    setStreamingEnabled,
    cancelStream,
  };

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChatContext(): ChatContextValue {
  const context = React.useContext(ChatContext);

  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }

  return context;
}
