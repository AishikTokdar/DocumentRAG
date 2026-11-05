/**
 * useChat Hook
 *
 * Custom hook for managing chat state and operations.
 * Supports both standard JSON and SSE streaming responses.
 *
 * Usage:
 * const { chatHistory, isLoading, sendMessage, clearHistory } = useChat();
 *
 * Implementation note: ``sendMessageStreaming`` owns an ``AbortController`` in
 * ``abortRef`` so the UI can cancel in-flight SSE when the user navigates away
 * or hits Stop.
 */

import * as React from "react";
import { api, ApiError, streamQuestion } from "@/lib/api";
import { createChatEntry } from "@/lib/chat-history";
import type { ChatEntry } from "@/types";

interface ChatState {
  chatHistory: ChatEntry[];
  isLoading: boolean;
  error: string | null;
  streamingAnswer: string | null;
  statusMessage: string | null;
  failedDraft: { text: string; requestId: number } | null;
}

interface UseChatReturn extends ChatState {
  sendMessage: (message: string, model?: string, includeSources?: boolean, hybridMode?: boolean) => Promise<void>;
  sendMessageStreaming: (message: string, model?: string, includeSources?: boolean, hybridMode?: boolean) => void;
  clearHistory: () => Promise<boolean>;
  cancelStream: (keepDraft?: boolean) => void;
  setChatHistory: (entries: ChatEntry[]) => void;
}

const initialState: ChatState = {
  chatHistory: [],
  isLoading: false,
  error: null,
  streamingAnswer: null,
  statusMessage: null,
  failedDraft: null,
};

export function useChat(): UseChatReturn {
  const [state, setState] = React.useState<ChatState>(initialState);
  const abortRef = React.useRef<AbortController | null>(null);
  const streamGenerationRef = React.useRef(0);
  const pendingAnswer = React.useRef<{ question: string; text: string } | null>(null);
  const previewTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finishPreview = React.useCallback(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = undefined;
    pendingAnswer.current = null;
  }, []);

  const abortRequest = React.useCallback(() => {
    const generation = ++streamGenerationRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    finishPreview();
    return generation;
  }, [finishPreview]);

  React.useEffect(() => () => { abortRequest(); }, [abortRequest]);

  const sendMessage = React.useCallback(
    async (message: string, model?: string, includeSources?: boolean, hybridMode: boolean = false) => {
      const generation = abortRequest();
      const controller = new AbortController();
      abortRef.current = controller;
      pendingAnswer.current = { question: message, text: "" };
      setState((prev) => ({ ...prev, isLoading: true, streamingAnswer: null, error: null, failedDraft: null, statusMessage: null }));

      try {
        const response = await api.askQuestion(message, model, includeSources ?? true, hybridMode, controller.signal);
        if (generation !== streamGenerationRef.current) return;
        finishPreview();

        const newEntry = createChatEntry({
          question: message,
          answer: response.answer,
          sources: response.sources,
          sourceDetails: response.source_details,
          modelUsed: response.model_used,
        });

        setState((prev) => ({
          ...prev,
          chatHistory: [...prev.chatHistory, newEntry],
          isLoading: false,
          error: null,
          statusMessage: null,
        }));
      } catch (error) {
        if (generation !== streamGenerationRef.current || controller.signal.aborted) return;
        finishPreview();
        const errorMessage =
          error instanceof ApiError
            ? error.detail
            : "Failed to get response. Please check backend API keys and retry.";

        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage, failedDraft: { text: message, requestId: generation }, statusMessage: null }));
      }
    },
    [abortRequest, finishPreview],
  );

  const sendMessageStreaming = React.useCallback(
    (message: string, model?: string, includeSources?: boolean, hybridMode: boolean = false) => {
      const streamId = abortRequest();

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        failedDraft: null,
        streamingAnswer: "",
        statusMessage: null,
      }));

      const draft = { question: message, text: "" };
      pendingAnswer.current = draft;

      const controller = streamQuestion(
        { question: message, model, include_sources: includeSources ?? true, hybrid_mode: hybridMode, knowledge_mode: hybridMode ? "hybrid" : "strict" },
        {
          onStatus(_stage, msg) {
            if (streamId !== streamGenerationRef.current) return;
            const preview = draft.text;
            setState((prev) => ({ ...prev, statusMessage: msg, streamingAnswer: preview }));
          },
          onToken(text) {
            if (streamId !== streamGenerationRef.current) return;
            draft.text += text;
            if (previewTimer.current !== undefined) return;
            previewTimer.current = setTimeout(() => {
              previewTimer.current = undefined;
              if (streamId !== streamGenerationRef.current) return;
              const preview = draft.text;
              setState((prev) => ({ ...prev, streamingAnswer: preview }));
            }, 50);
          },
          onDone(meta) {
            if (streamId !== streamGenerationRef.current) return;
            finishPreview();
            const entry = createChatEntry({
              question: draft.question,
              answer: meta.answer ?? draft.text,
              sources: meta.sources,
              sourceDetails: meta.source_details,
              modelUsed: meta.model_used,
            });
            setState((prev) => ({
              ...prev,
              chatHistory: [...prev.chatHistory, entry],
              isLoading: false,
              streamingAnswer: null,
              statusMessage: null,
            }));
          },
          onError(msg) {
            if (streamId !== streamGenerationRef.current) return;
            finishPreview();
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: draft.text ? `The displayed response is incomplete. ${msg}` : msg,
              failedDraft: { text: message, requestId: streamId },
              streamingAnswer: draft.text || null,
              statusMessage: null,
            }));
          },
        },
      );

      abortRef.current = controller;
    },
    [abortRequest, finishPreview],
  );

  const cancelStream = React.useCallback((keepDraft = false) => {
    const draft = keepDraft ? pendingAnswer.current : null;
    const generation = abortRequest();
    setState((prev) => ({
      ...prev,
      isLoading: false,
      streamingAnswer: draft?.text || null,
      statusMessage: null,
      error: draft ? (draft.text ? "Response stopped. The displayed response is incomplete." : "Response stopped.") : null,
      failedDraft: draft ? { text: draft.question, requestId: generation } : null,
    }));
  }, [abortRequest]);

  const clearHistory = React.useCallback(async () => {
    const generation = abortRequest();
    setState(prev => ({...prev, isLoading:true}));
    try {
      await api.clearChatHistory();
      if (generation !== streamGenerationRef.current) return false;
      setState(initialState);
      return true;
    } catch {
      if (generation === streamGenerationRef.current) setState(prev => ({...prev, isLoading:false, error:"Could not clear server conversation. Please retry."}));
      return false;
    }
  }, [abortRequest]);

  const setChatHistory = React.useCallback((entries: ChatEntry[]) => {
    abortRequest();
    setState((prev) => ({ ...prev, chatHistory: entries }));
  }, [abortRequest]);

  return {
    ...state,
    sendMessage,
    sendMessageStreaming,
    clearHistory,
    cancelStream,
    setChatHistory,
  };
}
