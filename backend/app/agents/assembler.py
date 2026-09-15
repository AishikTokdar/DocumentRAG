"""
Assembler Agent

Final agent in the pipeline.  Takes the validated answer string and
packages it into a structured output dict ready for the API response.

Responsibilities:
- Attaches source-page citations when ``include_sources`` is set.
- Adds timing and model metadata.
- Optionally formats markdown or plain-text output.
"""

import re
from collections import defaultdict
from typing import Any

from langchain_core.documents import Document

from ..services.evidence import document_identity, format_evidence
from .base_agent import BaseAgent
from .optimizer import SUMMARY_SCOPE_NOTICE


class AssemblerAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="assembler", description="Packages the validated answer into a structured response"
        )

    @staticmethod
    def _coverage_notes(
        answer: str, chunks: list[Document], citations: dict[str, str], context: dict[str, Any]
    ) -> list[str]:
        requested = context.get("requested_sources", {})
        notes = [SUMMARY_SCOPE_NOTICE] if context.get("retrieval_intent") == "summary" else []
        if not requested:
            return notes

        references: dict[str, set[str]] = defaultdict(set)
        for index, doc in enumerate(chunks, 1):
            references[document_identity(doc.metadata)].add(citations[f"E{index}"])

        def names(identities: list[str]) -> str:
            labels = []
            for identity in identities:
                label = re.sub(r"[\x00-\x1f\x7f]", " ", requested[identity]).strip()
                if len(label) > 180:
                    label = f"{label[:165]}…{label[-14:]}"
                longest_run = max((len(run) for run in re.findall(r"\x60+", label)), default=0)
                fence = chr(96) * (1 + longest_run)
                labels.append(f"{fence} {label} {fence}")
            return ", ".join(labels)

        missing = [identity for identity in requested if identity not in references]
        uncited = [
            identity for identity in requested
            if identity in references and not any(ref in answer for ref in references[identity])
        ]
        partial = [identity for identity in requested if identity in context.get("partial_source_ids", ())]
        if missing:
            notes.append(f"No passages from {names(missing)} fit the evidence selection for this answer.")
        if uncited:
            notes.append(f"The answer did not cite the retrieved passages from {names(uncited)}.")
        if partial:
            notes.append(f"PDF text extraction was incomplete for {names(partial)}.")
        return notes

    def process(self, input_data: str, context: dict[str, Any]) -> dict[str, Any]:
        answer = input_data
        optimized_chunks = context.get("optimized_chunks", [])
        sources: list | None = None
        source_details: list[dict[str, Any]] | None = None
        if isinstance(optimized_chunks, list):
            _, citations = format_evidence(optimized_chunks)
            if context.get("include_sources"):
                sources = list(dict.fromkeys(ref for ref in citations.values() if ref in answer))[:15]
                details_by_ref: dict[str, dict[str, Any]] = {}
                for i, doc in enumerate(optimized_chunks, 1):
                    ref = citations.get(f"E{i}")
                    if ref and ref in answer and ref not in details_by_ref:
                        meta = doc.metadata or {}
                        page = meta.get("page")
                        clean_text = " ".join(re.sub(r"^\[Document:[^\]]+\]\s*", "", doc.page_content).split())
                        snippet = clean_text[:220] + ("…" if len(clean_text) > 220 else "")
                        details_by_ref[ref] = {
                            "citation": ref,
                            "source_file": str(meta.get("source_file") or "Document"),
                            "page": page + 1 if isinstance(page, int) else None,
                            "snippet": snippet,
                        }
                source_details = [details_by_ref[r] for r in sources if r in details_by_ref]
            notes = self._coverage_notes(answer, optimized_chunks, citations, context)
            if notes:
                answer += "\n\n> " + " ".join(notes)
                context["warnings"] = list(dict.fromkeys([*context.get("warnings", []), *notes]))
        elif context.get("include_sources"):
            sources = list(dict.fromkeys(str(p) for p in context.get("chunk_sources", [])))

        pipeline_info = {
            "retrieved_chunks": context.get("retrieved_chunks", 0),
            "filtered_chunks": context.get("filtered_chunks", 0),
            "optimizer_output_chunks": context.get("optimizer_output_chunks", 0),
            "validation_passed": context.get("validation_passed", True),
            "is_uncertain": context.get("is_uncertain_answer", False),
        }

        result: dict[str, Any] = {
            "answer": answer,
            "model_used": context.get("model_used"),
            "sources": sources,
            "source_details": source_details,
            "pipeline_info": pipeline_info,
        }

        context["assembler_done"] = True
        return result
