/**
 * usePDFUpload Hook
 * 
 * Custom hook for managing PDF upload state and operations.
 * Handles single and multi-file PDF uploads.
 */

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { MAX_PDF_FILES } from "@/lib/constants";
import type { DocumentFileMeta } from "@/types";

interface PDFUploadState {
  corpusId: string | null;
  isUploading: boolean;
  isLoaded: boolean;
  fileName: string | null;
  chunksCreated: number | null;
  files: DocumentFileMeta[];
  totalFiles: number;
  error: string | null;
}

interface UsePDFUploadReturn extends PDFUploadState {
  uploadPDF: (file: File) => Promise<void>;
  uploadPDFs: (files: File[]) => Promise<void>;
  reset: () => void;
}

const initialState: PDFUploadState = {
  corpusId: null,
  isUploading: false,
  isLoaded: false,
  fileName: null,
  chunksCreated: null,
  files: [],
  totalFiles: 0,
  error: null,
};

export function usePDFUpload(): UsePDFUploadReturn {
  const [state, setState] = React.useState<PDFUploadState>(initialState);
  const generationRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    abortRef.current = controller;
    void api.getStatus(controller.signal).then(status => {
      if (generation !== generationRef.current || controller.signal.aborted || !status.pdf_loaded || !status.corpus_id || !status.files?.length) return;
      setState({ corpusId: status.corpus_id, isUploading: false, isLoaded: true,
        fileName: status.files[0].file_name, chunksCreated: status.chunks_created ?? null,
        files: status.files, totalFiles: status.files.length, error: null });
    }).catch(() => { });
    return () => { generationRef.current += 1; abortRef.current?.abort(); };
  }, []);

  const uploadPDFs = React.useCallback(async (files: File[]) => {
    if (!files.length) return;
    abortRef.current?.abort();
    const generation = ++generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    if (files.length > MAX_PDF_FILES) {
      setState((prev) => ({
        ...prev,
        error: `Maximum ${MAX_PDF_FILES} PDF documents allowed per session.`,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isUploading: true,
      error: null,
    }));

    try {
      const response = await api.uploadPDFs(files, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;

      setState({
        corpusId: response.corpus_id ?? null,
        isUploading: false,
        isLoaded: true,
        fileName: response.file_name || files[0].name,
        chunksCreated: response.chunks_created,
        files: response.files || [],
        totalFiles: response.total_files || files.length,
        error: null,
      });
    } catch (error) {
      if (generation !== generationRef.current || controller.signal.aborted) return;
      const message =
        error instanceof ApiError
          ? error.detail
          : "Failed to upload PDF(s). Please try again.";

      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: message,
      }));
    }
  }, []);

  const uploadPDF = React.useCallback(
    async (file: File) => {
      await uploadPDFs([file]);
    },
    [uploadPDFs],
  );

  const reset = React.useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    setState(initialState);
  }, []);

  return {
    ...state,
    uploadPDF,
    uploadPDFs,
    reset,
  };
}
