"""
Upload Routes

Endpoints for document upload and processing.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from ..config import MAX_PDF_FILES, get_settings
from ..models import DocumentFileMeta, StatusResponse, UploadResponse
from ..services.ip_rate_limit import check_upload_rate_limit
from ..services.pdf_processor import PDFProcessor
from ..services.request_limits import run_bounded_worker
from ..services.session_vector_registry import SessionVectorRegistry, is_valid_session_id
from ..services.usage_counters import increment_pdf_uploads
from ..services.vector_store import VectorStoreService

router = APIRouter(tags=["Document Ingestion"])

_pdf_processor: PDFProcessor | None = None
_vector_registry: SessionVectorRegistry | None = None

def get_pdf_processor() -> PDFProcessor:
    global _pdf_processor
    if _pdf_processor is None:
        _pdf_processor = PDFProcessor()
    return _pdf_processor

def get_vector_registry() -> SessionVectorRegistry:
    global _vector_registry
    if _vector_registry is None:
        settings = get_settings()
        _vector_registry = SessionVectorRegistry(settings.max_vector_sessions)
    return _vector_registry

def require_session_id(
    x_chat_session_id: Annotated[str | None, Header()] = None,
) -> str:
    sid = (x_chat_session_id or "").strip()
    if not sid or not is_valid_session_id(sid):
        raise HTTPException(
            status_code=400,
            detail="Missing or invalid X-Chat-Session-Id header (send a UUID v4).",
        )
    return sid

def get_vector_service(
    session_id: Annotated[str, Depends(require_session_id)],
) -> VectorStoreService:
    return get_vector_registry().get_or_create(session_id)

def set_services(pdf_processor: PDFProcessor, vector_registry: SessionVectorRegistry):
    global _pdf_processor, _vector_registry
    _pdf_processor = pdf_processor
    _vector_registry = vector_registry

@router.post("/upload", response_model=UploadResponse)
async def upload_pdf(
    files: list[UploadFile] = File(...),
    _: None = Depends(check_upload_rate_limit),
    pdf_processor: PDFProcessor = Depends(get_pdf_processor),
    vector_service: VectorStoreService = Depends(get_vector_service),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > MAX_PDF_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PDF_FILES} document uploads allowed per session",
        )

    settings = get_settings()
    total_bytes = 0
    file_contents: list[tuple[str, bytes]] = []

    for file in files:
        fname = file.filename or "document.pdf"
        if not fname.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"File '{fname}' is not a valid PDF file",
            )

        buffer = bytearray()
        while block := await file.read(65536):
            buffer.extend(block)
            if total_bytes + len(buffer) > settings.max_file_size:
                raise HTTPException(413, "Combined PDF upload size exceeds the limit")
        await file.close()
        if not buffer.startswith(b"%PDF-"):
            raise HTTPException(400, "Uploaded file is not a PDF")
        data = bytes(buffer)
        if len(data) > settings.max_file_size:
            raise HTTPException(
                status_code=400,
                detail=f"File '{fname}' exceeds the 50 MB limit",
            )
        total_bytes += len(data)
        file_contents.append((fname, data))

    if total_bytes > settings.max_file_size:
        total_mb = round(total_bytes / (1024 * 1024), 2)
        raise HTTPException(
            status_code=400,
            detail=f"Total combined size of uploaded PDFs ({total_mb} MB) exceeds the 50 MB limit",
        )

    all_chunks = []
    file_metas: list[DocumentFileMeta] = []

    for fname, data in file_contents:
        try:
            res = await run_bounded_worker(pdf_processor.process_uploaded_file, data, fname)
            all_chunks.extend(res.chunks)
            file_metas.append(
                DocumentFileMeta(
                    file_name=fname,
                    page_count=res.total_pages,
                    chunks_created=res.total_chunks,
                    readable_pages=res.readable_pages,
                    warnings=[] if res.complete else ["Some pages have no readable text. Answers cover extracted text only."],
                )
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            err_msg = str(e)
            if any(
                k in err_msg
                for k in [
                    "Stream has ended unexpectedly",
                    "EOF marker not found",
                    "PdfReadError",
                    "is not a valid PDF",
                ]
            ):
                raise HTTPException(
                    status_code=400, detail=f"Corrupt or invalid PDF file '{fname}': {err_msg}"
                ) from e
            raise HTTPException(
                status_code=500,
                detail="Unable to process the PDF. Please retry.",
            ) from e

    if len(all_chunks) > settings.max_document_chunks:
        raise HTTPException(400, "Documents exceed the indexing limit")
    try:
        await run_bounded_worker(get_vector_registry().replace_documents, vector_service, all_chunks)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Document indexing is unavailable. Check server storage and retry.") from None
    increment_pdf_uploads()

    first_file = file_metas[0].file_name if file_metas else None
    return UploadResponse(
        corpus_id=vector_service.corpus_id,
        message=f"Successfully processed {len(file_metas)} document(s)",
        chunks_created=len(all_chunks),
        file_name=first_file,
        files=file_metas,
        total_files=len(file_metas),
    )

@router.get(
    "/status", response_model=StatusResponse, dependencies=[Depends(check_upload_rate_limit)]
)
async def get_status(
    vector_service: VectorStoreService = Depends(get_vector_service),
):
    from ..main import SERVER_BOOT_ID
    settings = get_settings()
    is_ready = vector_service.is_ready
    files = vector_service.document_files
    return StatusResponse(
        status="ready" if is_ready else "waiting",
        message="PDF loaded and ready for questions"
        if is_ready
        else "No PDF loaded. Please upload a PDF first.",
        pdf_loaded=is_ready,
        model=settings.default_model,
        documents_loaded=vector_service.document_count,
        server_boot_id=SERVER_BOOT_ID,
        corpus_id=vector_service.corpus_id,
        chunks_created=sum(item["chunks_created"] for item in files),
        files=[DocumentFileMeta(**item) for item in files],
    )

@router.delete("/session", dependencies=[Depends(check_upload_rate_limit)])
async def delete_session(session_id: Annotated[str, Depends(require_session_id)]):
    purged = await run_in_threadpool(get_vector_registry().delete_session, session_id)
    return {"status": "cleared", "session_id": session_id, "purged": purged}
