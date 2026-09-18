from collections import defaultdict, deque
from typing import Any

from langchain_core.documents import Document

from ..config import get_settings
from ..services.evidence import document_identity, fit_evidence, token_count
from .base_agent import BaseAgent

SUMMARY_SCOPE_NOTICE = "Summary covers retrieved passages, not necessarily every section."

def expand_parent_context(chunks: list[Document], max_parent_tokens: int = 768) -> list[Document]:
    expanded: list[Document] = []
    seen_parents: set[tuple[str, str]] = set()
    for doc in chunks:
        parent_id = doc.metadata.get("parent_id")
        parent_content = doc.metadata.get("parent_content")
        if parent_id and parent_content:
            identity = (document_identity(doc.metadata), str(parent_id))
            if token_count(str(parent_content)) > max_parent_tokens:
                expanded.append(doc)
                continue
            if identity in seen_parents:
                continue
            seen_parents.add(identity)
            meta = dict(doc.metadata)
            breadcrumb = meta.get("breadcrumb", "")
            if breadcrumb and not parent_content.startswith("[Document:"):
                content = f"{breadcrumb}\n{parent_content}"
            else:
                content = parent_content
            expanded.append(Document(page_content=content, metadata=meta))
        else:
            expanded.append(doc)
    return expanded

class OptimizerAgent(BaseAgent):
    def __init__(self, context_token_budget: int | None = None):
        super().__init__(
            name="optimizer", description="Reorders and trims context for optimal LLM prompting"
        )
        self.context_token_budget = context_token_budget or get_settings().context_token_budget

    def process(
        self,
        input_data: tuple[str, list[Document]],
        context: dict[str, Any],
    ) -> tuple[str, list[Document]]:
        question, chunks = input_data

        intent = context.get("retrieval_intent", "focused")
        source_count = len({document_identity(doc.metadata) for doc in chunks})
        parent_budget = min(768, max(64, self.context_token_budget // max(1, source_count) - 100))
        ranked = expand_parent_context(list(chunks), parent_budget)
        if intent in {"summary", "comparison"}:
            groups: dict[str, dict[str, deque[Document]]] = defaultdict(lambda: defaultdict(deque))
            for doc in ranked:
                section = doc.metadata.get("section") or doc.metadata.get("page", "")
                key = str(section) if intent == "summary" else ""
                groups[document_identity(doc.metadata)][key].append(doc)
            sources = deque(deque(sections.values()) for sections in groups.values())
            ranked = []
            while sources:
                sections = sources.popleft()
                passages = sections.popleft()
                ranked.append(passages.popleft())
                if passages:
                    sections.append(passages)
                if sections:
                    sources.append(sections)
        limit = context.get("evidence_limit", context.get("retrieval_k", get_settings().retrieval_k))
        fitted = fit_evidence(ranked, self.context_token_budget, limit=limit)
        if intent == "summary":
            context.setdefault("warnings", []).append(SUMMARY_SCOPE_NOTICE)

        context["optimizer_input_chunks"] = len(chunks)
        context["optimizer_output_chunks"] = len(fitted)
        context["optimizer_token_budget"] = self.context_token_budget
        context["optimized_chunks"] = fitted

        return (question, fitted)
