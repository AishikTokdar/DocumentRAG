"""
Extractor Agent

Retrieves relevant document chunks from the vector store
based on the user's question.
"""

import re
from typing import Any

from langchain_core.documents import Document

from ..services.document_reports import ALL_DOCUMENTS, report_intent
from ..services.evidence import document_identity
from ..services.vector_store import VectorStoreService
from .base_agent import BaseAgent


class ExtractorAgent(BaseAgent):
    def __init__(self, vector_service: VectorStoreService, k: int = 4):
        super().__init__(
            name="extractor", description="Retrieves relevant document chunks from vector store"
        )
        self.vector_service = vector_service
        self.k = k

    def process(self, input_data: str, context: dict[str, Any]) -> list[Document]:
        question = input_data
        k = context.get("retrieval_k", self.k)
        current_question = context.get("original_question", question)
        intent = report_intent(current_question)
        broad = intent != "focused"
        context["retrieval_intent"] = intent
        context["evidence_limit"] = 12 if broad else k
        options: dict[str, Any] = {}
        if current_question != question:
            options["anchor_query"] = current_question
        if not broad and not ALL_DOCUMENTS.search(current_question):
            named = frozenset(
                document_identity({"document_id": file.get("document_id"), "source_file": file["file_name"]})
                for file in self.vector_service.document_files
                if re.search(
                    rf"(?<![\w.-]){re.escape(str(file['file_name']))}(?![\w-]|\.\w)",
                    current_question, re.I,
                )
            )
            if named:
                options["source_ids"] = named
        if broad:
            options["balance_sources"] = True
            files = self.vector_service.document_files
            requested_sources: dict[str, str] = {}
            named_sources: dict[str, str] = {}
            partial_sources: set[str] = set()
            question_text = current_question.casefold()
            for file in files:
                name = str(file["file_name"])
                identity = document_identity({"document_id": file.get("document_id"), "source_file": name})
                label = name
                if sum(other["file_name"] == name for other in files) > 1:
                    label = f"{name} ({identity[:8]})"
                requested_sources[identity] = label
                pattern = rf"(?<![\w.-]){re.escape(name.casefold())}(?![\w-]|\.\w)"
                if re.search(pattern, question_text):
                    named_sources[identity] = label
                if file.get("warnings"):
                    partial_sources.add(identity)
            all_sources = ALL_DOCUMENTS.search(question_text)
            if named_sources and not all_sources and (intent != "comparison" or len(named_sources) > 1):
                requested_sources = named_sources
                options["source_ids"] = frozenset(named_sources)
            context["requested_sources"] = requested_sources
            context["partial_source_ids"] = partial_sources & requested_sources.keys()
            context["evidence_limit"] = max(12, len(requested_sources) * 4)
        chunks = self.vector_service.similarity_search(question, k=60 if broad else 30, **options)
        context["retrieved_chunks"] = len(chunks)
        context["chunk_sources"] = [chunk.metadata.get("page", "N/A") for chunk in chunks]

        return chunks
