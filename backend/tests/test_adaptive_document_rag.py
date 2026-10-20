"""Document-specific regressions for the ResearchPaperRAG recovery/grounding port."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.documents import Document
from langchain_core.messages import AIMessage, AIMessageChunk

from app.agents.extractor import ExtractorAgent
from app.agents.optimizer import OptimizerAgent, expand_parent_context
from app.config import AI_PROVIDERS
from app.services.document_reports import report_depth, report_token_budget
from app.services.evidence import format_evidence, ground_answer
from app.services.llm_service import LLMService


class AdaptiveDocumentRagTests(unittest.TestCase):
    def docs(self, count=2):
        return [Document(
            page_content=f"The notice period is {12 + i} days. The policy excludes flood damage. The coordinator logs alerts.",
            metadata={"source_file": f"policy-202{i}.pdf", "document_id": str(i), "page": 0},
        ) for i in range(count)]

    def test_two_to_five_source_budgets_and_both_modes(self):
        service = LLMService()
        budgets = []
        for count in range(2, 6):
            for hybrid in (False, True):
                with self.subTest(count=count, hybrid=hybrid):
                    prompt, budget, preserve = service._document_prompt("Summarize all PDFs", self.docs(count), hybrid)
                    self.assertEqual(budget, report_token_budget(count, service.settings.report_max_tokens))
                    self.assertTrue(preserve)
                    self.assertIn(f"all {count} sources", prompt)
                    self.assertEqual("## Background knowledge" in prompt, hybrid)
                    self.assertEqual(service._document_prompt("What is the notice period?", self.docs(count), hybrid)[1], service.settings.followup_max_tokens)
            budgets.append(budget)
        self.assertEqual(budgets, sorted(set(budgets)))
        self.assertEqual(report_token_budget(5, 900), 900)
        self.assertIn("450-650", report_depth(2))
        self.assertIn("220-350", report_depth(5))

    def test_large_parents_keep_relevant_children_and_distinct_identities(self):
        docs = self.docs(5)
        for doc in docs:
            doc.metadata.update(parent_id="same.pdf:p0:s0", parent_content="Unrelated parent material. " * 3000)
        context = {"retrieval_intent": "summary", "evidence_limit": 20}
        _, found = OptimizerAgent(1500).process(("Summarize all PDFs", docs), context)
        self.assertEqual({doc.metadata["document_id"] for doc in found}, {str(i) for i in range(5)})
        for doc in docs:
            doc.metadata["parent_content"] = "Small parent."
        self.assertEqual(len(expand_parent_context(docs)), 5)

    def test_focused_named_document_is_filtered(self):
        calls = []
        store = SimpleNamespace(document_files=[{"file_name": "policy-2020.pdf", "document_id": "0"}],
                                similarity_search=lambda *args, **kwargs: calls.append(kwargs) or [])
        ExtractorAgent(store).process("What is the notice in policy-2020.pdf?", {})
        self.assertEqual(calls[0]["source_ids"], frozenset({"0"}))

    def test_valid_formats_and_unsupported_attribution_in_both_modes(self):
        docs = self.docs()
        _, citations = format_evidence(docs)
        good = [
            "## policy-2020.pdf\n\nThe notice period is 12 days [E1].",
            "(1) The notice period is 12 days [E1].",
            "The procedure includes: (1) the coordinator logs alerts; (2) the policy excludes flood damage [E1].",
            "Document 1 gives 12 days [E1], whereas Document 2 gives 13 days [E2].",
            "| Topic | A | B |\n| --- | --- | --- |\n| Notice | 12 days [E1] | 13 days [E2] |",
        ]
        bad = [
            "**The notice period is 99 days**\n\nThe coordinator logs alerts [E1].",
            "Document 1 gives 13 days [E2], whereas Document 2 gives 12 days [E1].",
            "| Topic | A | B |\n| --- | --- | --- |\n| Notice | 13 days [E1] | 12 days [E2] |",
            "The notice is 13 days [E1]. Another period is 12 days [E2].",
            "The policy probably requires biometric verification [E1].",
            "policy-2021.pdf gives 12 days [E1].",
        ]
        for hybrid in (False, True):
            for answer in good:
                with self.subTest(mode=hybrid, good=answer):
                    self.assertFalse(ground_answer(answer, citations, docs, allow_background=hybrid).startswith("I cannot"))
            for answer in bad:
                with self.subTest(mode=hybrid, bad=answer):
                    self.assertTrue(ground_answer(answer, citations, docs, allow_background=hybrid).startswith("I cannot"))

    def test_background_boundary_and_surviving_valid_blocks(self):
        docs = self.docs()
        _, citations = format_evidence(docs)
        general = "## Background knowledge\n\nNotice periods help parties plan transitions."
        self.assertEqual(ground_answer(general, citations, docs, allow_background=True), general)
        self.assertTrue(ground_answer(general, citations, docs).startswith("I cannot"))
        disguised = "## Background knowledge\n\nThe uploaded document requires biometric verification."
        self.assertTrue(ground_answer(disguised, citations, docs, allow_background=True).startswith("I cannot"))
        draft = "The notice period is 12 days [E1].\n\nThe notice is 99 days [E1].\n\n" + general
        warnings = []
        checked = LLMService._check_document_answer(draft, citations, docs, True, True, warnings)
        self.assertIn("12 days", checked)
        self.assertIn("Notice periods help", checked)
        self.assertNotIn("99 days", checked)
        self.assertNotIn("omitted from", checked)
        self.assertTrue(warnings)

    def test_long_reports_are_advisory_and_document_uncertainty_is_preserved(self):
        from app.agents.validator import ValidatorAgent
        context = {}
        report = "A supported long report. " * 400
        self.assertEqual(ValidatorAgent().process(report, context), report)
        self.assertTrue(context["validation_passed"])
        docs = [Document(page_content="The policy may require biometric verification after review.")]
        answer = "The policy may require biometric verification after review [E1]."
        self.assertFalse(ground_answer(answer, {"E1": "[policy]"}, docs).startswith("I cannot"))

    def test_exhausted_stream_recovery_returns_verified_partial_and_is_not_cached(self):
        service = self.service()
        calls = []
        class Model:
            async def astream(self, messages, **kwargs):
                calls.append(messages)
                if len(calls) == 1:
                    yield AIMessageChunk(content="The notice period is 12 days [E1].\n\n")
                raise ConnectionError("lost connection")
        async def run():
            with patch.object(service, "_build_llm_with_key", return_value=Model()):
                return [event async for event in service.stream_answer_with_failover("What is the notice period?", self.docs())]
        events = asyncio.run(run())
        final = events[-1]
        self.assertEqual(final["type"], "complete")
        self.assertIn("12 days", final["answer"])
        self.assertTrue(any("incomplete" in warning for warning in final["warnings"]))
        self.assertEqual(len(calls), 3)
        self.assertFalse(service._answers)

    def service(self):
        service = LLMService()
        self.addCleanup(patch.stopall)
        patch.object(service, "_attempts", return_value=iter([(AI_PROVIDERS["groq"], "fixture", "key", 5.0, "sig", 1)])).start()
        patch("app.services.llm_service.record_success").start()
        return service

    def test_stream_resumes_partial_first_segment_without_duplication(self):
        service = self.service()
        prefix = "The notice period is 12 days [E1].\n\n"
        calls = []
        class Model:
            async def astream(self, messages, **kwargs):
                calls.append(messages)
                if len(calls) == 1:
                    yield AIMessageChunk(content=prefix)
                    raise ConnectionError("lost connection")
                yield AIMessageChunk(content=prefix + "The coordinator logs alerts [E1].", response_metadata={"finish_reason": "stop"})
        async def run():
            with patch.object(service, "_build_llm_with_key", return_value=Model()):
                return [event async for event in service.stream_answer_with_failover("What is the notice period?", self.docs())]
        events = asyncio.run(run())
        complete = [event for event in events if event["type"] == "complete"]
        self.assertEqual(len(complete), 1)
        self.assertEqual(complete[0]["answer"].count("12 days"), 1)
        self.assertIn("policy-2020.pdf", complete[0]["answer"])
        self.assertTrue(any(event.get("stage") == "recovery" for event in events))
        self.assertIn("untrusted_evidence", calls[1][1].content)

    def test_json_recovers_same_continuation_and_model(self):
        service = self.service()
        calls = []
        class Model:
            def invoke(self, messages, **kwargs):
                calls.append(messages)
                if len(calls) == 1:
                    return AIMessage(content="The notice is 12 days [E1].\n\n", response_metadata={"finish_reason": "length"})
                if len(calls) == 2:
                    raise ConnectionError("lost connection")
                return AIMessage(content="The coordinator logs alerts [E1].", response_metadata={"finish_reason": "stop"})
        with patch.object(service, "_build_llm_with_key", return_value=Model()):
            answer, model, warnings = service.generate_text("System", "Question", "Evidence", "fixture", "test", 128)
        self.assertIn("12 days", answer)
        self.assertIn("logs alerts", answer)
        self.assertEqual(calls[1], calls[2])
        self.assertEqual(model, "fixture")
        self.assertFalse(warnings)

    def test_user_cancellation_is_not_retried(self):
        service = self.service()
        calls = []
        class Model:
            async def astream(self, messages, **kwargs):
                calls.append(messages)
                yield AIMessageChunk(content="A provisional answer")
                raise asyncio.CancelledError()
        async def run():
            with patch.object(service, "_build_llm_with_key", return_value=Model()):
                with self.assertRaises(asyncio.CancelledError):
                    async for _ in service.stream_text([], "fixture", "test", 128):
                        pass
        asyncio.run(run())
        self.assertEqual(len(calls), 1)
