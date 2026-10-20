"""Tests for Option A (few-shot grounding exemplars) and Option D (self-correction micro-repair)."""

import asyncio
import unittest
from unittest.mock import patch

from langchain_core.documents import Document

from app.services.evidence import format_evidence
from app.services.llm_service import LLMService


class GroundingAndRepairTests(unittest.TestCase):
    def test_prompt_templates_require_attribution_without_synthetic_facts(self):
        service = LLMService()
        strict = service.STRICT_RAG_PROMPT_TEMPLATE
        self.assertIn("[E1]", strict)
        self.assertIn("each table data cell", strict)
        self.assertNotIn("15 minutes", strict)
        self.assertIn("Insufficient evidence:", strict)
        hybrid = service.HYBRID_RAG_PROMPT_TEMPLATE
        self.assertIn("## Background knowledge", hybrid)
        self.assertIn("not verified document evidence", hybrid)
        repair = service.REPAIR_PROMPT_TEMPLATE
        self.assertIn("grounded citation repair assistant", repair)
        self.assertIn("bracketed IDs from the evidence", repair)

    def test_self_correction_repairs_uncited_factual_draft(self):
        service = LLMService()
        docs = [Document(page_content="The notice period is 12 days.", metadata={"source_file": "policy.pdf", "page": 0})]
        _, citations = format_evidence(docs)
        uncited_draft = "The notice period is 12 days."
        repaired_draft = "The notice period is 12 days [E1]."
        with patch.object(service, "generate_text", side_effect=[(uncited_draft, "model-a", []), (repaired_draft, "model-a", [])]):
            answer, used, _, warnings = service.generate_answer("What is notice period?", docs)
        self.assertIn("12 days", answer)
        self.assertIn("[policy.pdf - Page 1]", answer)
        self.assertNotIn("cannot", answer)

    def test_self_correction_falls_back_if_repair_fails(self):
        service = LLMService()
        docs = [Document(page_content="The notice period is 12 days.", metadata={"source_file": "policy.pdf", "page": 0})]
        uncited_draft = "The notice period is 12 days."
        still_uncited = "The notice period is still 12 days."
        with patch.object(service, "generate_text", side_effect=[(uncited_draft, "model-a", []), (still_uncited, "model-a", [])]):
            answer, _, _, _ = service.generate_answer("What is notice period?", docs)
        self.assertTrue(answer.startswith("I cannot"))

    def test_self_correction_does_not_trigger_on_abstention(self):
        service = LLMService()
        docs = [Document(page_content="The notice period is 12 days.", metadata={"source_file": "policy.pdf", "page": 0})]
        abstention = "I cannot find sufficient evidence in the document."
        with patch.object(service, "generate_text", return_value=(abstention, "model-a", [])), patch.object(service, "_repair_answer") as mock_repair:
            answer, _, _, _ = service.generate_answer("What is pricing?", docs)
            mock_repair.assert_not_called()
        self.assertIn("cannot find", answer)

    def test_streaming_self_correction_yields_repair_stage_and_heals(self):
        service = LLMService()
        docs = [Document(page_content="The notice period is 12 days.", metadata={"source_file": "policy.pdf", "page": 0})]
        uncited_draft = "The notice period is 12 days."
        repaired_draft = "The notice period is 12 days [E1]."
        async def fake_stream_text(messages, model, feature, max_tokens):
            yield {"type": "token", "content": uncited_draft, "model_used": "model-a"}
            yield {"type": "complete", "model_used": "model-a", "answer": uncited_draft}
        async def run():
            events = []
            with patch.object(service, "stream_text", side_effect=fake_stream_text), patch.object(service, "_repair_answer", return_value=(repaired_draft, "model-a", [])):
                async for event in service.stream_answer_with_failover("What is notice period?", docs):
                    events.append(event)
            return events
        events = asyncio.run(run())
        stages = [e.get("stage") for e in events if e.get("type") == "status"]
        self.assertIn("verify", stages)
        self.assertIn("repair", stages)
        complete = next(e for e in events if e.get("type") == "complete")
        self.assertIn("12 days", complete["answer"])
        self.assertIn("[policy.pdf - Page 1]", complete["answer"])

    def test_assembler_generates_source_details_with_snippets(self):
        from app.agents.assembler import AssemblerAgent
        doc = Document(page_content="The duty coordinator records active concerns.", metadata={"source_file": "incident.pdf", "page": 0})
        context = {"optimized_chunks": [doc], "include_sources": True}
        result = AssemblerAgent().process("Duty coordinator records active concerns [incident.pdf - Page 1].", context)
        self.assertIn("sources", result)
        self.assertEqual(result["sources"], ["[incident.pdf - Page 1]"])
        self.assertIn("source_details", result)
        self.assertEqual(len(result["source_details"]), 1)
        item = result["source_details"][0]
        self.assertEqual(item["citation"], "[incident.pdf - Page 1]")
        self.assertEqual(item["source_file"], "incident.pdf")
        self.assertEqual(item["page"], 1)
        self.assertIn("duty coordinator", item["snippet"])

    def test_format_breadcrumb_and_split_documents(self):
        from app.services.chunking import format_breadcrumb, split_documents
        meta = {"source_file": "incident.pdf", "page": 0, "section": "## Escalation Protocol"}
        self.assertEqual(format_breadcrumb(meta), "[Document: incident.pdf | Page 1 | Section: Escalation Protocol]")
        meta_no_sec = {"source_file": "incident.pdf", "page": 2}
        self.assertEqual(format_breadcrumb(meta_no_sec), "[Document: incident.pdf | Page 3]")

        raw_page = "## Escalation Protocol\nThe duty coordinator must record alerts within 15 minutes.\n\n## Deputy Responsibilities\nThe deputy lead takes over when the primary responder is unreachable."
        docs = [Document(page_content=raw_page, metadata={"source_file": "incident.pdf", "page": 0})]
        chunks = split_documents(docs, chunk_size=100, overlap=10)
        self.assertGreater(len(chunks), 0)
        for chunk in chunks:
            self.assertTrue(chunk.page_content.startswith("[Document: incident.pdf | Page 1"))
            self.assertIn("parent_id", chunk.metadata)
            self.assertIn("parent_content", chunk.metadata)
            self.assertIn("child_content", chunk.metadata)

    def test_optimizer_expand_parent_context(self):
        from app.agents.optimizer import expand_parent_context
        parent_text = "Full section text with all procedures and conditions."
        meta1 = {"source_file": "doc.pdf", "page": 0, "parent_id": "doc.pdf:p0:s0", "parent_content": parent_text, "breadcrumb": "[Document: doc.pdf | Page 1]"}
        meta2 = {"source_file": "doc.pdf", "page": 0, "parent_id": "doc.pdf:p0:s0", "parent_content": parent_text, "breadcrumb": "[Document: doc.pdf | Page 1]"}
        c1 = Document(page_content="[Document: doc.pdf | Page 1]\nChild chunk 1", metadata=meta1)
        c2 = Document(page_content="[Document: doc.pdf | Page 1]\nChild chunk 2", metadata=meta2)
        expanded = expand_parent_context([c1, c2])
        self.assertEqual(len(expanded), 1)
        self.assertIn("Full section text", expanded[0].page_content)
        self.assertIn("[Document: doc.pdf | Page 1]", expanded[0].page_content)

    def test_report_depth_comparison_table_instructions(self):
        from app.services.document_reports import report_depth
        summary_depth = report_depth(2, intent="summary")
        self.assertNotIn("Markdown comparison table", summary_depth)
        comparison_depth = report_depth(2, intent="comparison")
        self.assertIn("Markdown comparison table", comparison_depth)
        self.assertIn("Key Differences Matrix", comparison_depth)

    def test_markdown_comparison_table_grounding(self):
        from app.services.evidence import format_evidence, ground_answer
        docs = [
            Document(page_content="Lead is Duty Coordinator. SLA is 15 minutes.", metadata={"source_file": "incident.pdf", "page": 0}),
            Document(page_content="Lead is Procurement Manager. SLA is 48 hours.", metadata={"source_file": "supplier.pdf", "page": 0}),
        ]
        _, citations = format_evidence(docs)
        valid_table = (
            "## Key Differences Matrix\n\n"
            "| Dimension | Incident Response | Supplier Onboarding |\n"
            "| :--- | :--- | :--- |\n"
            "| Primary Lead | Duty Coordinator [E1] | Procurement Manager [E2] |\n"
            "| Response SLA | 15 minutes [E1] | 48 hours [E2] |"
        )
        grounded = ground_answer(valid_table, citations, docs)
        self.assertNotIn("I cannot", grounded)
        self.assertIn("[incident.pdf - Page 1]", grounded)
        self.assertIn("[supplier.pdf - Page 1]", grounded)

        uncited_table = (
            "## Key Differences Matrix\n\n"
            "| Dimension | Incident Response | Supplier Onboarding |\n"
            "| :--- | :--- | :--- |\n"
            "| Primary Lead | Duty Coordinator | Procurement Manager |\n"
        )
        rejected = ground_answer(uncited_table, citations, docs)
        self.assertTrue(rejected.startswith("I cannot"))

    def test_assembler_strips_breadcrumb_from_snippet(self):
        from app.agents.assembler import AssemblerAgent
        doc = Document(
            page_content="[Document: incident.pdf | Page 1 | Section: Triage]\nThe duty coordinator logs alerts.",
            metadata={"source_file": "incident.pdf", "page": 0},
        )
        context = {"optimized_chunks": [doc], "include_sources": True}
        result = AssemblerAgent().process("The duty coordinator logs alerts [incident.pdf - Page 1].", context)
        item = result["source_details"][0]
        self.assertNotIn("[Document:", item["snippet"])
        self.assertIn("The duty coordinator logs alerts.", item["snippet"])


if __name__ == "__main__":
    unittest.main()

