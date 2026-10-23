"""Local-only real API/parser/FAISS fixture with deterministic external boundaries.

Never deploy this server. It creates temporary data and does not call LLM APIs.
"""
import asyncio
import io
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from fastapi import Response
from langchain_core.embeddings import Embeddings
from langchain_core.messages import AIMessage, AIMessageChunk
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

def fixture_pdf() -> bytes:
    writer = PdfWriter()
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page = writer.add_blank_page(width=600, height=800)
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    contents = DecodedStreamObject()
    contents.set_data(b"BT /F1 12 Tf 30 700 Td (The policy notice period is 12 days.) Tj ET")
    page[NameObject("/Contents")] = contents
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()

class FixtureEmbeddings(Embeddings):
    def embed_documents(self, texts):
        return [[1.0, 0.0] for _ in texts]

    def embed_query(self, text):
        return [1.0, 0.0]

class FixtureLLM:
    def invoke(self, messages, **kwargs):
        return AIMessage(content="The policy notice period is 12 days [E1].")

    async def astream(self, messages, **kwargs):
        if "Stop this answer during generation" in str(messages[-1].content):
            yield AIMessageChunk(content="The policy notice period ")
            await asyncio.sleep(10)
            yield AIMessageChunk(content="is 12 days [E1].")
            return
        for part in ["The policy notice period ", "is 12 days [E1]."]:
            await asyncio.sleep(0.05)
            yield AIMessageChunk(content=part)

def fixture_app(stack: ExitStack, directory: Path):
    from app.config import get_settings
    from app.main import create_app
    settings = get_settings()
    for key, value in {"faiss_persist_dir": str(directory), "allowed_hosts": "localhost,127.0.0.1,testserver",
                       "embedding_use_remote": False, "rate_limit_ask_per_minute": 0,
                       "rate_limit_upload_per_minute": 0, "telemetry_tunnel_dsn": None}.items():
        stack.enter_context(patch.object(settings, key, value))
    stack.enter_context(patch("app.services.llm_service.get_all_provider_api_keys", return_value=["fixture-key"]))
    stack.enter_context(patch("app.services.llm_service.LLMService._build_llm_with_key", return_value=FixtureLLM()))
    stack.enter_context(patch("app.services.vector_store.get_local_embeddings", return_value=FixtureEmbeddings()))
    app = create_app()

    @app.get("/__test__/pdf", include_in_schema=False)
    def pdf_fixture():
        return Response(content=fixture_pdf(), media_type="application/pdf")

    return app

if __name__ == "__main__":
    import uvicorn
    with tempfile.TemporaryDirectory(prefix="document-rag-integration-") as directory, ExitStack() as stack:
        uvicorn.run(fixture_app(stack, Path(directory)), host="127.0.0.1", port=8999, proxy_headers=False)
