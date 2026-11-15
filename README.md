# DocumentRAG

A general-purpose PDF conversation and comparative analysis workspace by Aishik Tokdar. Upload up to five PDFs (50 MB combined), ask questions, perform cross-document comparisons with structured matrix tables, check interactive document/page citations, and export conversations. There is no total question limit for a loaded document session. The server applies a rolling request rate limit.

DocumentRAG shares engineering patterns with ResearchPaperRAG while keeping a document-first conversation flow. Academic discovery and research-gap reports belong to the sibling project.

## Architecture & Core Features

- **7-Stage Agent Pipeline**: Structured sequential pipeline (Extractor → Analyzer → Preprocessor → Optimizer → Synthesizer → Validator → Assembler) handling intent classification, deduplication, balanced token budgeting, streaming synthesis, and citation assembly.
- **Hybrid Retrieval & RRF**: Local CPU `all-MiniLM-L6-v2` embeddings in FAISS plus in-memory lexical BM25 retrieval fused via Reciprocal Rank Fusion (RRF).
- **Multi-Document Comparative Synthesis**: Comparison queries automatically generate structured Markdown matrix tables with aligned criteria, document columns, and cell-level inline citations.
- **Strict Grounding & Verification**: Compact evidence IDs mapped to document/page references. Paragraph grounding, numeric literal verification, and quotation checks reduce unsupported outputs.
- **Interactive Citation Tooltips**: Hovering citation pills renders Radix Tooltips with source file, page number, and grounded excerpt previews.
- **Multi-Provider Resilience**: Dynamic failover across Google Gemini, Groq, and OpenRouter with thread-safe `Retry-After` cooldown maps and automated answer continuation.
- **Streaming & Shared Finalization**: JSON and SSE answers share finalization. Streamed drafts are replaced by the canonical checked answer; interruptions are not completed conversations.
- **Export Engine**: Export full conversation histories to Markdown (`.md`), plain text (`.txt`), and styled paginated PDF (`.pdf`).
- **Privacy & Session Isolation**: Anonymous UUID v4 bearer tokens (`X-Chat-Session-Id`), client-side IndexedDB conversation persistence (`document-rag-db`), isolated vector stores per session, and zero document telemetry by default.
- **Security & Limits**: Subprocess PDF extraction, request body limits (131 KB API / 51 MB upload), concurrency semaphores, and trusted proxy enforcement.

## Local setup

Use Python 3.12 and Node 24 for the documented CI configuration.

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
Copy-Item backend/.env.example backend/.env
# Configure provider credentials in backend/.env
backend/.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The default embedding path runs locally. Remote Gemini embeddings require explicit server opt-in. Paid-only, purchased-credit and temporary-trial inference providers are not supported. The Gemini/Groq/OpenRouter catalogue was checked against official docs on 2026-11-03; actual availability and free quotas depend on the provider and account billing tier. No API keys belong in frontend environment variables.

`backend/requirements-api.txt` is the API profile. `backend/requirements.txt` additionally installs optional Gradio/Spaces dependencies for compatibility entrypoints.

## Deployment

The root Dockerfile builds the frontend and backend into one container. Compose builds a backend plus Nginx frontend; Nginx proxies API requests on the same origin with streaming buffering disabled. Configure `ALLOWED_HOSTS`, `CORS_ORIGINS`, and `TRUSTED_PROXY_IPS` for the actual deployment. Do not trust caller-supplied forwarding headers at the public edge.

Use one API worker/instance for this session store. The root build context excludes secrets, indexes, uploads, environments, and dependencies. Both API images run as a non-root user.

For hosted platform deployment:
- See `backend/README.md` for Hugging Face Gradio Space deployment.
- See `frontend/README.md` for Cloudflare Pages and Vercel static deployment.

## Session and privacy behavior

`X-Chat-Session-Id` is an anonymous bearer capability, not account authentication. Browser-profile storage shares a capability across tabs; this is not per-tab isolation. Reset deletes server document state and rotates the browser capability. Unknown status probes do not register sessions or evict uploaded documents.

Eligible backend indexes recover after restarts when host storage persists; startup prunes indexes older than `FAISS_SESSION_MAX_AGE_DAYS` (default 3). This is not a continuous deletion deadline or durable-storage guarantee. Saved local transcripts reactivate only against a matching server-verified corpus; otherwise re-upload matching documents. New transcript keys include the corpus fingerprint, preventing same-name files from sharing an active history. Unmatched old transcripts remain readable/exportable archives. Old pickle indexes are never loaded; re-upload after upgrading.

Telemetry is disabled unless a deployment DSN is explicitly configured. Replay, traces, default PII, prompts, document contents, and generated answers are excluded. Public funded deployments should apply appropriate edge access and spend controls.

## API

- `POST /upload`: up to five PDFs; returns file coverage and corpus identity.
- `POST /ask`: checked answer, model, sources, warnings.
- `POST /ask/stream`: provisional token events followed by canonical `done.answer`.
- `DELETE /chat/history`: clear server conversation context and answer cache.
- `DELETE /session`: purge document state.
- `GET /status`, `/health`, `/models`, `/runtime-summary`: readiness/configuration diagnostics.
- `/docs`: interactive schema documentation.

The omitted knowledge mode defaults to strict. Legacy `hybrid_mode` remains supported; contradictory mode fields return 422. Byte limits return 413; resource/rate limits 429; conflicting turns 409. Scanned PDFs need an existing OCR text layer. Partial readable coverage is disclosed.

## Checks

```powershell
backend/.venv/Scripts/python scripts/check_backend.py
python scripts/sync_model_catalog.py --check
python scripts/sync_deployment_profiles.py --check
cd frontend
npm run typecheck
npm run lint
npm run test:security
npm run build
```

The backend checker runs Ruff, mypy, and unittest (88 unit tests). `node scripts/check-backend.mjs` selects the project virtual environment or `BACKEND_PYTHON`. Tests substitute model generation and use deterministic embeddings; they do not consume paid inference. CI runs these checks on Linux.

## License

MIT. Copyright 2026 Aishik Tokdar.
