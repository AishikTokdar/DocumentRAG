"""
FastAPI backend entry point for DocumentRAG.
"""

import os
import uuid
from contextlib import asynccontextmanager
from textwrap import dedent

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["PYTHONUNBUFFERED"] = "1"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import MAX_PDF_FILES, get_settings
from .routes import chat_router, health_router, runtime_summary_router, tunnel_router, upload_router
from .routes.upload import set_services as set_upload_services
from .services.body_limits import BodyLimitMiddleware
from .services.faiss_session_cleanup import prune_stale_session_indexes
from .services.pdf_processor import PDFProcessor
from .services.response_headers import ResponseHeadersMiddleware
from .services.session_vector_registry import SessionVectorRegistry

SERVER_BOOT_ID = str(uuid.uuid4())

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting DocumentRAG API (Boot ID: {SERVER_BOOT_ID})...")
    settings = get_settings()
    pdf_processor = PDFProcessor()

    stale, junk = prune_stale_session_indexes()
    print(f"FAISS startup cleanup: removed {stale} stale and {junk} invalid session directories")
    vector_registry = SessionVectorRegistry(settings.max_vector_sessions)
    set_upload_services(pdf_processor, vector_registry)

    print(f"Vector sessions: max {settings.max_vector_sessions}")
    if settings.rate_limit_upload_per_minute > 0 or settings.rate_limit_ask_per_minute > 0:
        print(
            "Rate limits (per IP / 60s): "
            f"upload={settings.rate_limit_upload_per_minute or 'off'}, "
            f"ask={settings.rate_limit_ask_per_minute or 'off'}"
        )
    else:
        print("Rate limits: disabled")
    print("API ready!")

    yield

    print("Shutting down...")

tags_metadata = [
    {
        "name": "Health & Operations",
        "description": "System health status checks, root endpoints, and operational diagnostics.",
    },
    {
        "name": "Document Ingestion",
        "description": f"Upload PDF documents (up to {MAX_PDF_FILES} files, cumulative <= 50 MB) and check indexing status.",
    },
    {
        "name": "RAG Chat & Reasoning",
        "description": "Submit questions with SSE token streaming, non-streaming JSON, and multi-model support.",
    },
    {
        "name": "Runtime Summary & Metrics",
        "description": "View provider health metrics, success/failure counts, and model availability dashboards.",
    },
    {
        "name": "Oversight & Monitoring",
        "description": "Sentry oversight tunnel and telemetry endpoints.",
    },
]

API_DESCRIPTION = dedent(f"""
DocumentRAG backend API for PDF ingestion, retrieval-augmented generation, and operational metrics.

This service supports multi-document PDF indexing, local zero-key CPU embeddings (`sentence-transformers/all-MiniLM-L6-v2`), FAISS vector search, a 7-stage agent pipeline, and multi-provider AI model failover.

### Key Interactive Documentation Endpoints:
* **Swagger UI Sandbox**: `/docs` - Interactive API testing & specification sandbox.
* **ReDoc Technical View**: `/redoc` - Clean reference documentation view.
* **OpenAPI Schema**: `/openapi.json` - Raw OpenAPI 3.1 JSON specification.

### Key Capabilities:
* **PDF Ingestion** (`POST /upload`): Upload up to {MAX_PDF_FILES} PDF files (cumulative size <= 50 MB).
* **Real-Time Streaming** (`POST /ask/stream`): Server-Sent Events (SSE) token-by-token streaming responses.
* **JSON Query** (`POST /ask`): Non-streaming JSON answer with source citations.
* **Multi-Model Support** (`GET /models`): a curated free-tier model catalogue across Google Gemini, Groq, and OpenRouter.
* **Knowledge Modes**: `Hybrid Brain` (synthesized world knowledge) vs `Strict to Source` (strict document citations).
""").strip()

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DocumentRAG Backend API",
        description=API_DESCRIPTION,
        version="1.0.0",
        openapi_tags=tags_metadata,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    cors_origins = settings.cors_origins
    allow_all = "*" in cors_origins

    app.add_middleware(BodyLimitMiddleware)
    hosts = [host.strip() for host in settings.allowed_hosts.split(",") if host.strip()]
    space_host = os.getenv("SPACE_HOST", "").strip().lower()
    if space_host.endswith(".hf.space") and all(c.isalnum() or c in ".-" for c in space_host):
        hosts.append(space_host)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else cors_origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(ResponseHeadersMiddleware)
    app.include_router(health_router)
    app.include_router(runtime_summary_router)
    app.include_router(upload_router)
    app.include_router(chat_router)
    app.include_router(tunnel_router)

    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
    if os.path.exists(static_dir):
        from fastapi.staticfiles import StaticFiles
        from starlette.exceptions import HTTPException

        class SPAStaticFiles(StaticFiles):
            async def get_response(self, path, scope):
                try:
                    return await super().get_response(path, scope)
                except HTTPException as exc:
                    if exc.status_code == 404 and scope["method"] in {"GET", "HEAD"} and path in {"chat", "api-status"}:
                        return await super().get_response("index.html", scope)
                    raise

        app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")

    return app

app = create_app()

if __name__ == "__main__":
    import os

    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
