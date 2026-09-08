"""Explicitly configured, local-only relevance scoring. Scores are not probabilities."""
from functools import lru_cache

from langchain_core.documents import Document

from ..config import get_settings


@lru_cache(maxsize=1)
def _model(path: str):
    from sentence_transformers import CrossEncoder
    return CrossEncoder(path, device="cpu", local_files_only=True, trust_remote_code=False)

def rerank_documents(query: str, documents: list[Document]) -> list[Document]:
    settings = get_settings()
    if not settings.local_reranker_model or not documents:
        return documents
    scores = _model(settings.local_reranker_model).predict([(query, doc.page_content) for doc in documents])
    ranked = sorted(zip(documents, scores, strict=True), key=lambda pair: float(pair[1]), reverse=True)
    threshold = settings.reranker_min_score
    return [Document(page_content=doc.page_content, metadata={**doc.metadata, "rerank_score":float(score)})
            for doc, score in ranked if threshold is None or float(score) >= threshold]
