import unittest
from types import SimpleNamespace
from unittest.mock import patch

from langchain_core.documents import Document

from app.agents.extractor import ExtractorAgent
from app.agents.pipeline import AgentPipeline
from app.services.evidence import format_evidence
from app.services.hybrid_retrieval import HybridIndex
from app.services.llm_service import LLMService

class RetrievalMaintenance(unittest.TestCase):
    def test_legacy_launch_path_uses_the_session_isolated_api(self):
        import main
        from app.main import app
        self.assertIs(main.app, app)

    def test_clause_numbers_are_searchable_as_identifiers(self):
        docs = [Document(page_content="Clause 4.3: notify the supplier."),
                Document(page_content="Clause 4.2: retain the receipt.")]
        self.assertEqual(HybridIndex(docs).lexical("4.2", 1), [1])

    def test_exact_clause_is_not_outvoted_by_generic_semantic_matches(self):
        docs = [Document(page_content=f"Clause 9.{i}: comply with the requirements.") for i in range(40)]
        target = Document(page_content="Clause 4.2: keep the original receipt.")
        docs.append(target)
        store = SimpleNamespace(similarity_search=lambda query, k: docs[:k])
        found = HybridIndex(docs).search(store, "What are the requirements of clause 4.2?", 4)
        self.assertEqual(found[0], target)

    def test_previous_clause_cannot_override_current_explicit_clause(self):
        old = Document(page_content="Clause 4.3: termination notice.")
        current = Document(page_content="Clause 4.2: renewal notice.")
        store = SimpleNamespace(similarity_search=lambda query, k: [old, current])
        found = HybridIndex([old, current]).search(
            store, "Current question: Does clause 4.2 change it? Previous question: clause 4.3", 2,
            anchor_query="Does clause 4.2 change it?")
        self.assertEqual(found[0], current)

    def test_comparison_preserves_smaller_document_candidates_with_one_dense_query(self):
        docs = [Document(page_content=f"Notice terms {i}", metadata={"document_id": "large"})
                for i in range(80)]
        docs += [Document(page_content="Cancellation letter", metadata={"document_id": "small"})]
        calls = []

        class Store:
            def similarity_search(self, query, k):
                calls.append(query)
                return docs[:k]

        found = HybridIndex(docs).search(Store(), "compare notice", 10, balance_sources=True)
        self.assertEqual({d.metadata["document_id"] for d in found}, {"large", "small"})
        self.assertEqual(len(calls), 1)

    def test_duplicate_dense_hits_cannot_gain_extra_fusion_votes(self):
        a, b = Document(page_content="alpha"), Document(page_content="beta")
        index = HybridIndex([a, b])
        store = SimpleNamespace(similarity_search=lambda query, k: [b, a, a, a])
        with patch.object(index, "lexical", return_value=[]):
            self.assertEqual(index.search(store, "query", 2), [b, a])

    def test_followup_keeps_current_question_before_long_history(self):
        service = LLMService()
        service.remember_turn("Historical topic " * 200, "")
        current = "What does it require for API key rotation?"
        contextual = service.contextual_question(current)
        self.assertLess(contextual.index(current), contextual.index("Historical topic"))

    def test_prior_summary_does_not_turn_focused_followup_into_summary(self):
        vector = SimpleNamespace(document_files=[], similarity_search=lambda *args, **kwargs: [])
        context = {"original_question": "How long is its notice period?"}
        ExtractorAgent(vector).process("Previous summary\nCurrent question: How long is its notice period?", context)
        self.assertEqual(context["retrieval_intent"], "focused")

    def test_configured_retrieval_count_is_used(self):
        with patch("app.agents.pipeline.get_settings", return_value=SimpleNamespace(retrieval_k=7)):
            pipeline = AgentPipeline(object(), object())
        self.assertEqual(pipeline.retrieval_k, 7)

    def test_sanitized_duplicate_titles_keep_distinct_citations(self):
        docs = [Document(page_content="First", metadata={"source_file": "policy [final].pdf", "document_id": "11111111-a", "page": 0}),
                Document(page_content="Second", metadata={"source_file": "policy [final].pdf", "document_id": "22222222-b", "page": 0})]
        _, citations = format_evidence(docs)
        self.assertNotEqual(citations["E1"], citations["E2"])

if __name__ == "__main__":
    unittest.main()
