"""Independent BM25 + dense retrieval with reciprocal rank fusion, without API calls."""
import math
import re
from collections import Counter, defaultdict, deque
from typing import Any

from langchain_core.documents import Document

from .evidence import document_identity


def words(text: str) -> list[str]:
    return re.findall(r"[^\W_]+(?:[./-][^\W_]+)*", text.casefold())

class HybridIndex:
    def __init__(self, documents: list[Document]):
        self.dense_size = len(documents)
        self.documents = list({self.key(doc): doc for doc in documents}.values())
        documents = self.documents
        self.positions = {self.key(doc): i for i, doc in enumerate(documents)}
        self.counts = [Counter(words(doc.page_content)) for doc in documents]
        self.lengths = [sum(count.values()) for count in self.counts]
        self.average = sum(self.lengths) / max(1, len(documents)) or 1
        self.frequency: Counter[str] = Counter()
        for count in self.counts:
            self.frequency.update(count.keys())
    def lexical(self, query: str, k: int = 30) -> list[int]:
        scores = []
        query_terms = set(words(query))
        for i, count in enumerate(self.counts):
            score = 0.0
            for word in query_terms:
                tf = count[word]
                if tf:
                    df = self.frequency[word]
                    idf = math.log(1 + (len(self.documents) - df + 0.5) / (df + 0.5))
                    score += (
                        idf * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * self.lengths[i] / self.average))
                    )
            if score > 0:
                scores.append((score, i))
        return [i for _, i in sorted(scores, key=lambda pair: (-pair[0], pair[1]))[:k]]
    def search(self, store: Any, query: str, k: int = 30, *, balance_sources: bool = False,
               anchor_query: str | None = None,
               source_ids: frozenset[str] | None = None) -> list[Document]:
        candidates = self.dense_size if balance_sources or source_ids else min(k, self.dense_size)
        dense = store.similarity_search(query, k=candidates)
        dense_ids = list(dict.fromkeys(self.positions[self.key(doc)] for doc in dense if self.key(doc) in self.positions))
        scores: dict[int, float] = {}
        for ranking in (dense_ids, self.lexical(query, candidates)):
            for rank, index in enumerate(ranking, 1):
                scores[index] = scores.get(index, 0) + 1 / (60 + rank)
        identifiers = {word for word in words(anchor_query if anchor_query is not None else query) if any(c.isdigit() for c in word)
                       and any(separator in word for separator in (".", "/", "-"))}
        ordered = sorted(scores, key=lambda index: (
            -len(identifiers.intersection(self.counts[index])), -scores[index], index))
        if source_ids is not None:
            ordered = [index for index in ordered if document_identity(self.documents[index].metadata) in source_ids]
        if balance_sources:
            groups: dict[str, deque[int]] = defaultdict(deque)
            for index in ordered:
                meta = self.documents[index].metadata
                groups[str(meta.get("document_id") or meta.get("source_file", ""))].append(index)
            ordered = []
            while any(groups.values()) and len(ordered) < k:
                for group in groups.values():
                    if group:
                        ordered.append(group.popleft())
        return [self.documents[i] for i in ordered[:k]]
    @staticmethod
    def key(doc: Document) -> tuple[str, str, str]:
        return (
            str(doc.metadata.get("document_id") or doc.metadata.get("source_file", "")),
            str(doc.metadata.get("page", "")),
            doc.page_content,
        )
