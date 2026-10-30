import modelCatalog from "@/lib/model-catalog.json";
/**
 * TypeScript Type Definitions
 *
 * Central location for all shared types and interfaces used throughout the application.
 * This ensures type safety and provides clear contracts for data structures.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface SourceDetail {
  citation: string;
  source_file?: string;
  page?: number;
  snippet?: string;
}

export interface ChatEntry {
  id?: string;
  question: string;
  answer: string;
  timestamp?: Date;
  sources?: string[];
  sourceDetails?: SourceDetail[];
  modelUsed?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

export interface PDFDocument {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  chunksCreated?: number;
}

export interface PDFUploadState {
  isUploading: boolean;
  isLoaded: boolean;
  document: PDFDocument | null;
  error: string | null;
}

export interface DocumentFileMeta {
  file_name: string;
  page_count: number;
  chunks_created: number;
  readable_pages?: number;
  warnings?: string[];
}

export interface AskQuestionRequest {
  question: string;
  model?: string;
  include_sources?: boolean;
  hybrid_mode?: boolean;
  knowledge_mode?: string;
}

export interface AskQuestionResponse {
  answer: string;
  sources?: string[];
  source_details?: SourceDetail[];
  model_used?: string;
  processing_time?: number;
}

export interface UploadResponse {
  corpus_id?: string;
  message: string;
  chunks_created: number;
  file_name?: string;
  files?: DocumentFileMeta[];
  total_files?: number;
}

export interface StatusResponse {
  corpus_id?: string | null;
  chunks_created?: number;
  files?: DocumentFileMeta[];
  status: string;
  message: string;
  pdf_loaded?: boolean;
  server_boot_id?: string;
}

export interface RuntimeProviderRow {
  id: string;
  display_name: string;
  llm_ready: boolean;
  embedding_ready: boolean;
  status: string;
}

export interface RuntimeSummary {
  status: string;
  providers: number;
  working: number;
  app_version: string;
  default_model: string;
  providers_detail: RuntimeProviderRow[];
  embedding_chunk_tokens?: number;
  embedding_overlap_tokens?: number;
  pipeline_agents?: number;
  embedding_chain_steps?: number;
  llm_providers_ready?: number;
  rate_limit_upload_per_minute?: number;
  rate_limit_ask_per_minute?: number;
  max_vector_sessions?: number;
  faiss_session_max_age_days?: number;
  total_pdf_uploads?: number;
  total_chat_completions?: number;
}

export interface APIError {
  detail: string;
  status_code?: number;
}

export type AIProvider =
  | "gemini"
  | "groq"
  | "openrouter";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  description?: string;
  maxTokens?: number;
  isDefault?: boolean;
  isAvailable?: boolean;
  apiKeyEnv?: string;
}

export const AI_MODELS: AIModel[] = modelCatalog.providers.flatMap(p => p.models.map(m => ({
  id: m.id, name: m.name, provider: p.name as AIProvider,
  description: `${p.name} model`, isDefault: m.id === modelCatalog.default_model,
})));

export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

export type AnimationDirection = "up" | "down" | "left" | "right" | "none";

export interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: AnimationDirection;
  delay?: number;
  duration?: number;
  className?: string;
}

export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

export interface TechStackItem {
  name: string;
  icon: React.ReactNode;
  category: "frontend" | "backend" | "ai" | "database";
  description?: string;
}
