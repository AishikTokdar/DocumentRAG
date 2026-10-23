import asyncio
import json
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from langchain_core.documents import Document
from app.agents.analyzer import AnalyzerAgent
from app.agents.extractor import ExtractorAgent
from app.agents.optimizer import OptimizerAgent
from app.services.evidence import format_evidence, ground_answer
from app.services.session_vector_registry import SessionVectorRegistry
from app.services.vector_store import VectorStoreService
from app.services.reranking import rerank_documents

class ReviewFixes(unittest.TestCase):
    def grounded(self, source, claim):
        docs=[Document(page_content=source,metadata={"source_file":"policy.pdf","page":0})]
        return ground_answer(claim,format_evidence(docs)[1],docs)

    def test_grounding_regressions(self):
        cases=[("The warranty excludes water damage. Coverage lasts 12 months.","The warranty covers water damage for 12 months. [E1]"),
               ("Temperature is -5 degrees.","Temperature is 5 degrees. [E1]"),
               ("Notice is 12 months.","Notice is 12 days. [E1]"),
               ("Water damage is excluded.","## Water damage is covered\n\nWater damage is excluded. [E1]"),
               ("The limit is 12 days.",'The policy says "The limit is 99 days." [E1]')]
        for source,claim in cases:
            with self.subTest(claim=claim): self.assertTrue(self.grounded(source,claim).startswith("I cannot"))
        for source,claim in [("Temperature is -5 degrees.","Temperature is -5 degrees. [E1]"),
                             ("The limit is 1,000 days.","The limit is 1000 days. [E1]")]:
            self.assertFalse(self.grounded(source,claim).startswith("I cannot"))

    def test_short_fact_survives(self):
        doc=Document(page_content="Notice period: 30 days.")
        self.assertEqual(AnalyzerAgent().process([doc],{}),[doc])
        self.assertEqual(AnalyzerAgent().process([Document(page_content="---")],{}),[])

    def test_single_search_and_intent_packing(self):
        from unittest.mock import Mock
        docs=[Document(page_content=f"Section {i} specifies notice requirements.",metadata={"page":i,"document_id":"a"}) for i in range(10)]
        service=Mock(); service.similarity_search.return_value=docs
        service.document_files = [{"document_id": "a", "file_name": "policy.pdf"}]
        context={"retrieval_k":4}
        chunks=ExtractorAgent(service).process("Summarize the entire document",context)
        service.similarity_search.assert_called_once()
        result=OptimizerAgent().process(("Summarize the entire document",chunks),context)[1]
        self.assertGreater(len(result),4)
        self.assertTrue(context["warnings"])

    def test_failed_replacement_preserves_registry_and_chat(self):
        with tempfile.TemporaryDirectory() as root, patch.object(VectorStoreService,"sessions_directory",return_value=root), patch.object(VectorStoreService,"_try_load_from_disk"):
            registry=SessionVectorRegistry(4)
            services=[registry.activate(VectorStoreService(str(uuid4()))) for _ in range(4)]
            chat=object(); services[0].chat_service=chat
            with patch.object(services[0],"prepare_documents",side_effect=ValueError("bad")):
                with self.assertRaises(ValueError): registry.replace_documents(services[0],[])
            self.assertIs(services[0].chat_service,chat)
            newcomer=VectorStoreService(str(uuid4()))
            with patch.object(newcomer,"prepare_documents",return_value=object()), patch.object(newcomer,"publish_documents",side_effect=OSError("disk full")):
                with self.assertRaises(OSError): registry.replace_documents(newcomer,[])
            self.assertEqual(list(registry._stores.values()),services)
            self.assertTrue(all(not s._retired for s in services))

    def test_evicted_object_cannot_write_after_reset(self):
        with tempfile.TemporaryDirectory() as root, patch.object(VectorStoreService,"sessions_directory",return_value=root), patch.object(VectorStoreService,"_try_load_from_disk"):
            registry=SessionVectorRegistry(4)
            original=registry.activate(VectorStoreService(str(uuid4())))
            for _ in range(4): registry.activate(VectorStoreService(str(uuid4())))
            registry.delete_session(original.session_id)
            self.assertTrue(original._retired)
            with self.assertRaises(ValueError): original.save_to_disk(object(),{"provider":"local"})

    def test_reset_during_unregistered_build_blocks_publication(self):
        with tempfile.TemporaryDirectory() as root, patch.object(VectorStoreService,"sessions_directory",return_value=root), patch.object(VectorStoreService,"_try_load_from_disk"):
            registry=SessionVectorRegistry(4); service=VectorStoreService(str(uuid4()))
            def build(docs): registry.delete_session(service.session_id); return object()
            with patch.object(service,"prepare_documents",side_effect=build), patch.object(service,"publish_documents") as publish:
                with self.assertRaises(HTTPException): registry.replace_documents(service,[])
                publish.assert_not_called()

    def test_busy_session_cannot_be_deleted_or_evicted(self):
        with tempfile.TemporaryDirectory() as root, patch.object(VectorStoreService,"sessions_directory",return_value=root), patch.object(VectorStoreService,"_try_load_from_disk"):
            registry=SessionVectorRegistry(4); service=registry.activate(VectorStoreService(str(uuid4())))
            service.operation_lock.acquire()
            try:
                with self.assertRaises(HTTPException) as err: registry.delete_session(service.session_id)
                self.assertEqual(err.exception.status_code,409)
                self.assertFalse(service._retired)
            finally: service.operation_lock.release()

    def test_configured_gate_uses_scorer_not_rank_fusion(self):
        docs=[Document(page_content="notice"),Document(page_content="irrelevant")]
        config=SimpleNamespace(local_reranker_model="local-fixture",reranker_min_score=0.4)
        with patch("app.services.reranking.get_settings",return_value=config), patch("app.services.reranking._model",return_value=SimpleNamespace(predict=lambda pairs:[0.8,0.1])):
            self.assertEqual([d.page_content for d in rerank_documents("notice",docs)],["notice"])

    def test_stream_time_includes_generation(self):
        from test_chat_stream_sse import _FakePipeline, _FakeLLMService
        from app.routes.chat import _stream_pipeline
        class SlowLLM(_FakeLLMService):
            async def stream_answer_with_failover(self,**kwargs):
                await asyncio.sleep(0.04)
                async for event in super().stream_answer_with_failover(**kwargs): yield event
        async def run():
            with patch("app.routes.chat.AgentPipeline",_FakePipeline):
                return [event async for event in _stream_pipeline("q",None,True,False,object(),SlowLLM())]
        events=asyncio.run(run())
        done=next(e for e in events if e.startswith("event: done"))
        payload=json.loads(done.split("data: ",1)[1])
        self.assertGreaterEqual(payload["processing_time"],0.035)

    def test_numbered_heading_label_is_not_a_numeric_claim(self):
        answer="## 1. Summary\n\nThe limit is 12 days. [E1]"
        self.assertFalse(self.grounded("The limit is 12 days.",answer).startswith("I cannot"))

    def test_stream_usage_is_provider_specific(self):
        from app.services.llm_service import LLMService
        from app.config import AI_PROVIDERS
        service=LLMService()
        config=SimpleNamespace(stream_usage_providers="groq",openrouter_api_base="https://example.invalid",temperature=0,max_tokens=800,llm_timeout_seconds=10)
        service.settings=config
        with patch("app.services.llm_service.ChatOpenAI") as client, patch.object(service,"_resolve_llm_api_keys",return_value=["test-key"]):
            provider=AI_PROVIDERS["groq"]
            service._build_llm_with_key(provider,provider.models[0],"test-key")
            self.assertTrue(client.call_args.kwargs["stream_usage"])
            provider=AI_PROVIDERS["gemini"]
            service._build_llm_with_key(provider,provider.models[0],"test-key")
            self.assertFalse(client.call_args.kwargs["stream_usage"])

    def test_retired_dependency_cannot_start_a_chat(self):
        from app.routes.chat import require_chat_turn
        service=SimpleNamespace(operation_lock=__import__("threading").Lock(),_retired=True)
        with self.assertRaises(HTTPException): next(require_chat_turn(service))
        self.assertFalse(service.operation_lock.locked())
