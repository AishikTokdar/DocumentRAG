"""
FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import chat_router, health_router, runtime_summary_router, tunnel_router, upload_router
from .routes.chat import set_llm_service
from .routes.upload import set_services as set_upload_services
from .services.faiss_session_cleanup import prune_stale_session_indexes
from .services.llm_service import LLMService
from .services.pdf_processor import PDFProcessor
from .services.session_vector_registry import SessionVectorRegistry


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting DocumentRAG API...")

    settings = get_settings()
    pdf_processor = PDFProcessor()

    stale, junk = prune_stale_session_indexes()
    if settings.faiss_session_max_age_days > 0:
        print(
            f"FAISS session cleanup (>{settings.faiss_session_max_age_days}d): "
            f"{stale} stale, {junk} junk dirs removed"
        )
    else:
        print("FAISS session cleanup: disabled")

    vector_registry = SessionVectorRegistry(settings.max_vector_sessions)
    llm_service = LLMService()

    set_upload_services(pdf_processor, vector_registry)
    set_llm_service(llm_service)

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


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="DocumentRAG API",
        description="""
        Chat with your PDF documents using Retrieval Augmented Generation.
        
        ## Features
        
        - **PDF Upload**: Upload and process PDF documents
        - **Smart Retrieval**: Find relevant content using vector similarity
        - **AI Answers**: Get accurate answers powered by LLMs
        - **Multi-Model**: Support for multiple AI providers
        
        ## Quick Start
        
        1. Upload a PDF using `/upload`
        2. Ask questions using `/ask`
        """,
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(runtime_summary_router)
    app.include_router(upload_router)
    app.include_router(chat_router)
    app.include_router(tunnel_router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
