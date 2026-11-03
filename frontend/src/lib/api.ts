/**
 * API Client Module
 *
 * Centralized API client for all backend communication.
 * Handles requests, responses, error handling, and SSE streaming.
 *
 * Walkthrough:
 *   1. ``withSessionHeaders`` injects ``X-Chat-Session-Id`` (see ``chat-session.ts``).
 *   2. JSON helpers use ``fetchWithErrorHandling``; streaming uses manual ``fetch`` + ReadableStream.
 *   3. ``api`` object groups REST calls used by hooks and components.
 */

import { errorDetail, requestSignal } from "./request-errors";
import { readServerEvents } from "./sse";
import { API_ENDPOINTS, joinApiUrl } from "./constants";
import { getChatApiSessionId, isValidChatApiSessionId, resetChatApiSessionId } from "./chat-session";
import type {
  AskQuestionRequest,
  AskQuestionResponse,
  UploadResponse,
  StatusResponse,
  APIError,
  RuntimeSummary,
  SourceDetail,
} from "@/types";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail || message;
  }
}

function withSessionHeaders(init?: RequestInit): RequestInit {
  const sid = getChatApiSessionId();
  if (!isValidChatApiSessionId(sid)) {
    throw new ApiError(
      "Chat session id is missing or invalid. Use a modern browser with Web Crypto enabled.",
      400,
      "missing_session_id",
    );
  }
  const merged: Record<string, string> = { "X-Chat-Session-Id": sid };
  const inHeaders = init?.headers;
  if (inHeaders instanceof Headers) {
    inHeaders.forEach((v, k) => {
      if (k.toLowerCase() !== "x-chat-session-id") merged[k] = v;
    });
  } else if (inHeaders && typeof inHeaders === "object") {
    for (const [k, v] of Object.entries(inHeaders as Record<string, string>)) {
      if (k.toLowerCase() !== "x-chat-session-id" && v !== undefined) {
        merged[k] = String(v);
      }
    }
  }
  return { ...init, headers: merged };
}

async function fetchWithErrorHandling<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  try {
    const signal = requestSignal(options?.signal);
    const response = await fetch(url, withSessionHeaders({ ...options, signal }));

    if (!response.ok) {
      const errorData: APIError = await response.json().catch(() => ({
        detail: `HTTP error ${response.status}`,
      }));
      const detail = errorDetail(errorData.detail, `HTTP error ${response.status}`);
      throw new ApiError(detail, response.status, detail);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new ApiError("The request timed out. Please retry.", 408);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      "Network error. Please check if the backend server is running.",
      0,
      "Connection failed",
    );
  }
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onDone: (meta: {
    answer?: string;
    model_used?: string;
    processing_time?: number;
    sources?: string[];
    source_details?: SourceDetail[];
  }) => void;
  onError: (message: string) => void;
  onStatus?: (stage: string, message: string) => void;
}

export function streamQuestion(
  request: AskQuestionRequest,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(
        joinApiUrl(API_ENDPOINTS.ASK_STREAM),
        withSessionHeaders({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: requestSignal(controller.signal),
        }),
      );

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ detail: "Stream failed" }));
        callbacks.onError(errorDetail(err.detail, "Stream failed"));
        return;
      }

      let completed = false;
      for await (const {event, data} of readServerEvents(response.body)) {
        if (event === "token") callbacks.onToken(data.content ?? "");
        else if (event === "status") callbacks.onStatus?.(data.stage, data.message);
        else if (event === "error") { callbacks.onError(errorDetail(data.message, "Stream interrupted")); return; }
        else if (event === "done") { completed = true; callbacks.onDone(data); return; }
      }
      if (!completed) callbacks.onError("The response was interrupted. Please retry.");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        callbacks.onError((err as Error).message ?? "Stream failed");
      }
    }
  })();

  return controller;
}

export const api = {
  async clearChatHistory(): Promise<void> {
    await fetchWithErrorHandling(joinApiUrl("/chat/history"), {method:"DELETE"});
  },
  async checkHealth(): Promise<StatusResponse> {
    return fetchWithErrorHandling<StatusResponse>(
      joinApiUrl(API_ENDPOINTS.HEALTH),
    );
  },

  async getStatus(signal?: AbortSignal): Promise<StatusResponse> {
    return fetchWithErrorHandling<StatusResponse>(
      joinApiUrl(API_ENDPOINTS.STATUS), { signal },
    );
  },

  async uploadPDFs(files: File[], signal?: AbortSignal): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach((f) => {
      formData.append("files", f);
    });

    return fetchWithErrorHandling<UploadResponse>(
      joinApiUrl(API_ENDPOINTS.UPLOAD),
      {
        method: "POST",
        body: formData,
        signal,
      },
    );
  },

  async uploadPDF(file: File): Promise<UploadResponse> {
    return this.uploadPDFs([file]);
  },

  async deleteSession(): Promise<{ status: string; session_id: string; purged: boolean }> {
    const result = await fetchWithErrorHandling<{ status: string; session_id: string; purged: boolean }>(
      joinApiUrl(API_ENDPOINTS.DELETE_SESSION),
      { method: "DELETE" },
    );
    resetChatApiSessionId();
    return result;
  },

  async askQuestion(
    question: string,
    model?: string,
    includeSources: boolean = true,
    hybridMode: boolean = false,
    signal?: AbortSignal,
  ): Promise<AskQuestionResponse> {
    const requestBody: AskQuestionRequest = {
      question,
      include_sources: includeSources,
      hybrid_mode: hybridMode,
      knowledge_mode: hybridMode ? "hybrid" : "strict",
    };
    if (model) requestBody.model = model;

    return fetchWithErrorHandling<AskQuestionResponse>(
      joinApiUrl(API_ENDPOINTS.ASK),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal,
      },
    );
  },
};

export async function fetchRuntimeSummary(
  options?: { signal?: AbortSignal },
): Promise<RuntimeSummary> {
  const url = joinApiUrl(API_ENDPOINTS.RUNTIME_SUMMARY);
  const response = await fetch(url, {
    signal: requestSignal(options?.signal, 15_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || `HTTP ${response.status}`, response.status);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new ApiError(
      "Backend endpoint returned HTML instead of JSON. Verify backend deployment URL.",
      502,
    );
  }

  try {
    return (await response.json()) as RuntimeSummary;
  } catch (err) {
    throw new ApiError(
      "Invalid JSON response received from backend API.",
      502,
      err instanceof Error ? err.message : undefined,
    );
  }
}

export default api;
