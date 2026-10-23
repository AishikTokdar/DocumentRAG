import asyncio
import os
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from integration_server import fixture_app, fixture_pdf
from langchain_core.documents import Document
from langchain_core.messages import AIMessageChunk

from app.services.evidence import OMITTED_PASSAGE, ground_answer, numeric_literals
from app.services.llm_service import LLMService

class SiblingSyncTests(unittest.TestCase):
    def test_identifiers_keep_the_exact_cited_spelling(self):
        docs = [Document(page_content="The document marker is PINE-SIGNAL-963.")]
        answer = ground_answer("The marker is **PINE\u2011SIGNAL\u2011963** [E1].", {"E1": "[guide]"}, docs)
        self.assertIn("PINE-SIGNAL-963", answer)
        self.assertIn("cannot verify", ground_answer("The marker is MAPLE-SIGNAL-963 [E1].", {"E1": "[guide]"}, docs))

    def test_identifier_repair_is_bound_to_the_cited_passage(self):
        docs = [Document(page_content="The marker is PINE-SIGNAL-963."), Document(page_content="The marker is MAPLE-SIGNAL-963.")]
        answer = ground_answer("The marker is PINE\u2011SIGNAL\u2011963 [E2].", {"E1": "[one]", "E2": "[two]"}, docs)
        self.assertIn("cannot verify", answer)

    def test_attached_citations_remain_readable(self):
        from app.services.evidence import resolve_citations
        for text in ("MARKER[E1].", "**MARKER**[E1].", "`MARKER`[e1]."):
            self.assertIn(" [policy.pdf - Page 1]", resolve_citations(text, {"E1": "[policy.pdf - Page 1]"}))

    def test_streaming_fallback_is_disclosed(self):
        from app.config import AI_PROVIDERS
        class Broken:
            async def astream(self, *args, **kwargs):
                raise RuntimeError("Temporary provider failure")
                yield
        class Working:
            async def astream(self, *args, **kwargs):
                yield AIMessageChunk(content="Supported answer [E1].")
        service = LLMService()
        async def run():
            attempts = [(AI_PROVIDERS["gemini"], "fixture", "key", 2.0, "sig", i) for i in (1, 2)]
            with patch.object(service, "_attempts", return_value=iter(attempts)), patch.object(service, "_build_llm_with_key", side_effect=[Broken(), Working()]), patch.object(service, "_failure"), patch("app.services.llm_service.record_success"):
                return [event async for event in service.stream_text([], "fixture", "pdf_chat_stream", 100)]
        events = asyncio.run(run())
        self.assertEqual(events[-1]["type"], "complete")
        self.assertEqual(events[-1]["warnings"], ["A fallback model was used."])

    def test_cors_rejects_unrelated_frontend_origins(self):
        from app.config import get_settings
        from app.main import create_app
        with patch.object(get_settings(), "cors_origins_csv", "https://documents.example"):
            client = TestClient(create_app())
            headers = {"Origin": "https://unrelated.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-Chat-Session-Id,Content-Type"}
            self.assertNotIn("access-control-allow-origin", client.options("/ask", headers=headers).headers)
            headers["Origin"] = "https://documents.example"
            self.assertEqual(client.options("/ask", headers=headers).headers["access-control-allow-origin"], "https://documents.example")

    def test_startup_pruning_preserves_eligible_indexes(self):
        from app.config import get_settings
        from app.services.faiss_session_cleanup import prune_stale_session_indexes
        from app.services.vector_store import VectorStoreService
        with tempfile.TemporaryDirectory() as directory, patch.object(VectorStoreService, "sessions_directory", return_value=directory), patch.object(get_settings(), "faiss_session_max_age_days", 3):
            current = Path(directory) / str(uuid4())
            stale = Path(directory) / str(uuid4())
            current.mkdir()
            stale.mkdir()
            old = time.time() - 4 * 86400
            os.utime(stale, (old, old))
            self.assertEqual(prune_stale_session_indexes(), (1, 0))
            self.assertTrue(current.exists())
            self.assertFalse(stale.exists())

    def test_full_stack_root_serves_the_frontend_when_present(self):
        from app.main import create_app
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "index.html"
            index.write_text("<!doctype html><title>DocumentRAG</title>", encoding="utf-8")
            with patch("app.routes.health.FRONTEND_INDEX", index):
                client = TestClient(create_app())
                self.assertIn("text/html", client.get("/").headers["content-type"])
                self.assertEqual(client.get("/health").json()["status"], "healthy")

    def test_citation_variants_keep_unknown_ids_invalid(self):
        docs = [Document(page_content="The notice period is 12 days.")]
        for citation in ("【e1】", "(E1)", "[e1; E1]"):
            result = ground_answer(f"The notice period is 12 days {citation}.", {"E1": "[policy]"}, docs)
            self.assertIn("[policy]", result)
        self.assertIn("cannot", ground_answer("The notice period is 12 days [Paper1].", {"E1": "[policy]"}, docs))
        self.assertIn("cannot", ground_answer("The notice period is 12 days [E9].", {"E1": "[policy]"}, docs))

    def test_numeric_equivalence_and_units_remain_strict(self):
        self.assertEqual(numeric_literals("0.001 91 percent 1,000"), numeric_literals("1e-3 91% 1000"))
        self.assertEqual(numeric_literals("https://example.org/2099/12"), set())
        self.assertLess(len(next(iter(numeric_literals("1e999999")))), 30)
        docs = [Document(page_content='The notice period is 12 days. The policy excludes floods.')]
        for claim in ("The notice period is 12 months [E1].", 'The policy says "covers floods" [E1].', "The policy covers floods [E1]."):
            self.assertIn("cannot", ground_answer(claim, {"E1": "[policy]"}, docs))

    def test_summary_omission_is_visible_and_not_cached(self):
        docs = [Document(page_content="The notice period is 12 days.")]
        answer = ground_answer("The notice period is 12 days [E1].\n\nThe notice period is 99 days [E1].", {"E1": "[policy]"}, docs, preserve_valid_blocks=True)
        self.assertIn("12 days", answer)
        self.assertIn(OMITTED_PASSAGE, answer)
        llm = LLMService()
        llm._remember_answer("partial", answer, "fixture", [])
        self.assertIsNone(llm._cached_answer("partial"))

    def test_old_summary_context_does_not_weaken_focused_grounding(self):
        docs = [Document(page_content="The notice period is 12 days.")]
        llm = LLMService()
        text = "The notice period is 12 days [E1].\n\nThe notice period is 99 days [E1]."
        with patch.object(llm, "generate_text", return_value=(text, "fixture", [])):
            answer = llm.generate_answer("Current question: Notice period?\nPrevious questions: summary", docs, original_question="Notice period?")[0]
            self.assertTrue(answer.startswith("I cannot"))

    def test_real_pdf_api_and_restart_recovery(self):
        from app.services.session_vector_registry import SessionVectorRegistry
        from app.services.vector_store import VectorStoreService
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            app = fixture_app(stack, Path(directory))
            with TestClient(app) as client:
                headers = {"X-Chat-Session-Id": str(uuid4())}
                response = client.post("/upload", headers=headers, files=[("files", ("policy.PDF", fixture_pdf(), "application/pdf"))])
                self.assertEqual(response.status_code, 200, response.text)
                corpus = response.json()["corpus_id"]
                status = client.get("/status", headers=headers).json()
                self.assertEqual(status["corpus_id"], corpus)
                self.assertEqual(status["files"][0]["file_name"], "policy.PDF")
                result = client.post("/ask", headers=headers, json={"question": "What is the notice period?", "hybrid_mode": False})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertIn("12 days", result.json()["answer"])
                registry = SessionVectorRegistry(4)
                stack.enter_context(patch("app.routes.upload._vector_registry", registry))
                restored = client.get("/status", headers=headers)
                self.assertEqual(restored.json()["corpus_id"], corpus)
                other = client.get("/status", headers={"X-Chat-Session-Id": str(uuid4())})
                self.assertFalse(other.json()["pdf_loaded"])
                deleted = client.delete("/session", headers=headers)
                self.assertEqual(deleted.status_code, 200)
                self.assertFalse(Path(VectorStoreService.disk_path_for_session(headers["X-Chat-Session-Id"])).exists())
