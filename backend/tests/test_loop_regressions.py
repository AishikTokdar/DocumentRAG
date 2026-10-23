"""Regressions found while exercising the real browser/API loop."""
import re
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.documents import Document

from app.agents.assembler import AssemblerAgent
from app.agents.optimizer import OptimizerAgent
from app.config import AI_PROVIDERS
from app.services.evidence import ground_answer
from app.services.llm_service import LLMService, _quota_cooldown

class LoopRegressions(unittest.TestCase):
    def test_copying_a_supplied_evidence_marker_produces_a_valid_citation(self):
        service = LLMService()
        docs = [Document(page_content="The processing fee is 45 USD.", metadata={"source_file": "policy-alpha.pdf", "page": 0})]

        def copy_marker(system, question, evidence, model, feature, max_tokens):
            marker = re.search(r"\[E[^\]]+\]", evidence)[0]
            return f"The processing fee is 45 USD {marker}.", "fixture", []

        with patch.object(service, "generate_text", side_effect=copy_marker):
            answer, _, _, _ = service.generate_answer("What is the processing fee?", docs)
        self.assertIn("45 USD", answer)
        self.assertIn("[policy-alpha.pdf - Page 1]", answer)
        self.assertNotIn("cannot", answer)

    def test_alternate_provider_precedes_extra_keys(self):
        service = LLMService()
        first, second = AI_PROVIDERS["groq"], AI_PROVIDERS["gemini"]
        sequence = [(first, first.models[0]), (second, second.models[0])]
        with (
            patch.object(service.settings, "llm_max_attempts", 2),
            patch.object(service, "_llm_attempt_sequence", return_value=sequence),
            patch.object(service, "_resolve_llm_api_keys", side_effect=[["first", "extra"], ["second"]]),
        ):
            attempts = list(service._attempts(None))
        self.assertEqual([attempt[2] for attempt in attempts], ["first", "second"])

    def test_rate_limit_hint_is_bounded_and_invalid_values_fall_back(self):
        error = RuntimeError("rate limited")
        for hint, expected in [("2.5", 2.5), ("999999", 300), ("nan", 60), ("invalid", 60)]:
            with self.subTest(hint=hint):
                with patch.object(error, "response", SimpleNamespace(headers={"retry-after": hint}), create=True):
                    self.assertEqual(_quota_cooldown(error), expected)

    def test_grouped_citations_resolve_and_unknown_ids_fail_closed(self):
        docs = [Document(page_content="The notice period is 12 days.")] * 2
        citations = {"E1": "[Policy - Page 1]", "E2": "[Policy - Page 1]"}
        answer = ground_answer("The notice period is 12 days (e1 / E2) .", citations, docs)
        self.assertEqual(answer, "The notice period is 12 days [Policy - Page 1].")
        self.assertTrue(ground_answer("The notice period is 12 days [E1/E9].", citations, docs).startswith("I cannot"))

    def test_summary_reserves_each_source_and_discloses_uncited_sources(self):
        long_source = [
            Document(page_content=f"Procedure section {number}.", metadata={
                "document_id": "large", "source_file": "large.pdf", "page": number,
            })
            for number in range(20)
        ]
        other_sources = [
            Document(page_content=f"Policy for {name}.", metadata={
                "document_id": name, "source_file": f"{name}.pdf", "page": 0,
            })
            for name in ("small", "third")
        ]
        context = {
            "retrieval_intent": "summary",
            "evidence_limit": 3,
            "requested_sources": {"large": "large.pdf", "small": "small.pdf", "third": "third.pdf"},
        }
        _, fitted = OptimizerAgent().process(("Summarize all documents", long_source + other_sources), context)
        self.assertEqual([doc.metadata["document_id"] for doc in fitted], ["large", "small", "third"])
        result = AssemblerAgent().process("Procedure summary [large.pdf - Page 1].", context)
        self.assertIn("did not cite the retrieved passages from", result["answer"])
        self.assertIn("small.pdf", result["answer"])
        self.assertIn("third.pdf", result["answer"])
