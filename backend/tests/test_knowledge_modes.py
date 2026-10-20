"""The two knowledge modes have distinct, evidence-aware contracts."""
import asyncio
import unittest
from unittest.mock import patch

from langchain_core.documents import Document

from app.services.evidence import format_evidence, ground_answer
from app.services.llm_service import LLMService


class KnowledgeModeTests(unittest.TestCase):
    def test_hybrid_has_an_independent_prompt(self):
        self.assertNotIn("Answer using only supplied evidence", LLMService.HYBRID_RAG_PROMPT_TEMPLATE)
        self.assertIn("general knowledge and reasoning", LLMService.HYBRID_RAG_PROMPT_TEMPLATE)
        self.assertIn("Answer using only supplied evidence", LLMService.STRICT_RAG_PROMPT_TEMPLATE)

    def test_no_passages_strict_abstains_hybrid_uses_model_output(self):
        generated = "## Background knowledge\n\nA contingency plan describes how to respond to a disruption."
        for hybrid in (False, True):
            with self.subTest(hybrid=hybrid):
                service = LLMService()
                with patch.object(service, "generate_text", return_value=(generated, "configured-model", [])) as model:
                    answer, used, _, _ = service.generate_answer("What is a contingency plan?", [], hybrid_mode=hybrid)
                self.assertEqual(model.call_count, int(hybrid))
                if hybrid:
                    self.assertEqual(answer, generated)
                    self.assertEqual(used, "configured-model")
                else:
                    self.assertIn("cannot find", answer)

    def test_no_passages_streaming_hybrid_uses_model_output(self):
        generated = "## Background knowledge\n\nA contingency plan describes response procedures."
        async def fake_stream(*args):
            yield {"type": "token", "content": generated}
            yield {"type": "complete", "answer": generated, "model_used": "configured-model"}
        async def run():
            service = LLMService()
            with patch.object(service, "stream_text", side_effect=fake_stream):
                return [event async for event in service.stream_answer_with_failover("Explain contingency planning", [], hybrid_mode=True)]
        self.assertEqual(asyncio.run(run())[-1]["answer"], generated)

    def test_background_subheadings_and_numbers_are_not_document_facts(self):
        docs = [Document(page_content="The coordinator logs alerts.", metadata={"source_file": "procedure.pdf"})]
        _, citations = format_evidence(docs)
        generated = (
            "The coordinator logs alerts [E1].\n\n## Background knowledge\n\n"
            "### ISO 27001\n\n**A review is useful**\n\n"
            "A general review can help identify procedural gaps."
        )
        for preserve in (False, True):
            answer = ground_answer(generated, citations, docs, allow_background=True, preserve_valid_blocks=preserve)
            self.assertIn("A general review", answer)
            self.assertIn("ISO 27001", answer)
            self.assertIn("[procedure.pdf", answer)
            bold = ground_answer(generated.replace("## Background knowledge", "**Background knowledge**"), citations, docs,
                                 allow_background=True, preserve_valid_blocks=preserve)
            self.assertIn("A general review", bold)
            self.assertIn("## Background knowledge", bold)
        self.assertTrue(ground_answer(generated, citations, docs).startswith("I cannot"))

    def test_peer_heading_ends_background_and_citations_cannot_be_invented(self):
        docs = [Document(page_content="The coordinator logs alerts.")]
        for suffix in ("## Findings\n\nThe coordinator has unlimited authority.",
                       "### General tips\n\nThe uploaded document requires 99 days.",
                       "General advice [E999]."):
            answer = "## Background knowledge\n\nGeneral context.\n\n" + suffix
            self.assertTrue(ground_answer(answer, {"E1": "[procedure]"}, docs, allow_background=True).startswith("I cannot"))

    def test_single_source_table_supports_a_dedicated_evidence_column(self):
        docs = [Document(page_content="The coordinator logs alerts within 12 minutes.")]
        valid = "| Task | Timing | Evidence |\n| --- | --- | --- |\n| Log alerts | 12 minutes | [E1] |"
        for hybrid in (False, True):
            self.assertFalse(ground_answer(valid, {"E1": "[procedure]"}, docs, allow_background=hybrid).startswith("I cannot"))
            self.assertTrue(ground_answer(valid.replace("12 minutes", "99 minutes"), {"E1": "[procedure]"}, docs, allow_background=hybrid).startswith("I cannot"))
            wrong_first_cell = "| Finding | Evidence |\n| --- | --- |\n| The coordinator logs alerts within 99 minutes | [E1] |"
            self.assertTrue(ground_answer(wrong_first_cell, {"E1": "[procedure]"}, docs, allow_background=hybrid).startswith("I cannot"))

    def test_hybrid_focused_answer_keeps_supported_parts_after_failed_repair(self):
        docs = [Document(page_content="The coordinator logs alerts.", metadata={"source_file": "procedure.pdf"})]
        draft = "Here is an explanation.\n\nThe coordinator logs alerts [E1].\n\n## Background knowledge\n\nLogging supports later review."
        service = LLMService()
        with patch.object(service, "generate_text", return_value=(draft, "configured-model", [])):
            answer, _, _, warnings = service.generate_answer("What does the coordinator do?", docs, hybrid_mode=True)
        self.assertIn("The coordinator logs alerts", answer)
        self.assertIn("Logging supports later review", answer)
        self.assertNotIn("Here is an explanation", answer)
        self.assertFalse(answer.startswith("I cannot"))
        self.assertTrue(warnings)
