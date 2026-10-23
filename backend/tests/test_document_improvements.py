import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from langchain_core.documents import Document
from app.models.schemas import QuestionRequest
from app.services.evidence import format_evidence, ground_answer, fit_evidence
from app.services.hybrid_retrieval import HybridIndex
from app.services.llm_service import LLMService
from app.services.session_vector_registry import SessionVectorRegistry
from app.services.vector_store import VectorStoreService
from app.config import get_settings
from fastapi.testclient import TestClient
from app.main import create_app

class DocumentImprovements(unittest.TestCase):
    def test_strict_default_and_conflicting_modes(self):
        self.assertFalse(QuestionRequest(question="What?").hybrid_mode)
        with self.assertRaises(ValueError):
            QuestionRequest(question="What?", hybrid_mode=True, knowledge_mode="strict")

    def test_citations_reject_invented_ids_and_numbers(self):
        docs = [Document(page_content="The limit is 12 days.", metadata={"source_file":"policy.pdf","page":0})]
        _, citations = format_evidence(docs)
        self.assertIn("policy.pdf", ground_answer("The limit is 12 days. [E1]", citations, docs))
        self.assertTrue(ground_answer("The limit is 99 days. [E1]", citations, docs).startswith("I cannot"))
        self.assertTrue(ground_answer("A claim [E999]", citations, docs).startswith("I cannot"))
        self.assertTrue(ground_answer("Suggestion: The limit is infinite.", citations, docs).startswith("I cannot"))

    def test_lexical_hit_outside_dense_candidates(self):
        docs = [Document(page_content="Ordinary overview"),Document(page_content="Clause ZX900 applies")]
        class Store:
            def similarity_search(self, query, k): return docs[:1]
        hits=HybridIndex(docs).search(Store(),"ZX900",2)
        self.assertIn(docs[1],hits)

    def test_empty_evidence_does_not_generate(self):
        llm=LLMService()
        with patch.object(llm,"generate_text",side_effect=AssertionError("API called")):
            self.assertIn("cannot find",llm.generate_answer("Question",[])[0])

    def test_only_successful_answers_are_cached(self):
        llm=LLMService()
        llm._remember_answer("a","A supported answer","model",[])
        self.assertEqual(llm._cached_answer("a"),("A supported answer","model"))
        llm._remember_answer("b","I cannot verify this","model",[])
        self.assertIsNone(llm._cached_answer("b"))
        llm.clear_conversation()
        self.assertIsNone(llm._cached_answer("a"))

    def test_unknown_status_sessions_do_not_fill_registry(self):
        from uuid import uuid4
        registry=SessionVectorRegistry(4)
        with patch.object(VectorStoreService,"_try_load_from_disk"):
            for _ in range(10): registry.get_or_create(str(uuid4()))
        self.assertEqual(len(registry._stores),0)

    def test_api_body_limit(self):
        client=TestClient(create_app())
        response=client.post("/ask",content=b"x"*140000)
        self.assertEqual(response.status_code,413)

    def test_safe_faiss_roundtrip(self):
        from langchain_core.embeddings import Embeddings
        class LocalTestEmbeddings(Embeddings):
            def embed_documents(self,texts): return [[1.0,0.0] for _ in texts]
            def embed_query(self,text): return [1.0,0.0]
        with tempfile.TemporaryDirectory() as directory, patch.object(VectorStoreService,"sessions_directory",return_value=directory), patch.object(VectorStoreService,"_make_local_cpu_embeddings",return_value=LocalTestEmbeddings()):
            service=VectorStoreService("11111111-1111-4111-8111-111111111111")
            service.create_from_documents([Document(page_content="The policy notice period is 12 days.",metadata={"source_file":"policy.pdf","page":0,"document_id":"one"})])
            restored=VectorStoreService(service.session_id)
            self.assertTrue(restored.is_ready)
            self.assertIn("12 days",restored.similarity_search("notice")[0].page_content)
            self.assertFalse((Path(service._persist_path())/"index.pkl").exists())
