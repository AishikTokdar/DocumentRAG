import hashlib
import json
import logging
import os
import shutil
import tempfile
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import faiss
from langchain_community.docstore.in_memory import InMemoryDocstore

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import warnings

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    from langchain_huggingface import HuggingFaceEmbeddings

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from ..config import AIProvider, get_embedding_fallback_chain, get_settings
from .chunking import LOCAL_EMBEDDING_MODEL
from .embedding_clients import GeminiEmbeddings
from .hybrid_retrieval import HybridIndex
from .reranking import rerank_documents

logger = logging.getLogger(__name__)

@lru_cache(maxsize=4)
def get_local_embeddings(model: str) -> Embeddings:
    return HuggingFaceEmbeddings(
        model_name=model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"batch_size": 16, "normalize_embeddings": True},
    )

class VectorStoreService:
    def __init__(self, session_id: str) -> None:
        self.settings = get_settings()
        self._session_id = session_id.strip()
        self.vectorstore: FAISS | None = None
        self.embeddings: Embeddings | None = None
        self._embedding_spec: dict[str, str] | None = None
        self._write_lock = threading.RLock()
        self.operation_lock = threading.Lock()
        self._retired = False
        self.chat_service: Any = None
        self._hybrid: HybridIndex | None = None
        self._read_state: tuple[FAISS, HybridIndex] | None = None

        self._try_load_from_disk()

    @property
    def session_id(self) -> str:
        return self._session_id

    @staticmethod
    def sessions_directory() -> str:
        settings = get_settings()
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            settings.faiss_persist_dir,
            "sessions",
        )

    @staticmethod
    def disk_path_for_session(session_id: str) -> str:
        return os.path.join(
            VectorStoreService.sessions_directory(),
            session_id.strip(),
        )

    def _resolve_api_key(self, provider: AIProvider) -> str | None:
        return next(iter(provider.api_keys), None)

    def _make_local_cpu_embeddings(self, model: str) -> Embeddings:
        return get_local_embeddings(model)

    def _make_embeddings(self, provider: AIProvider, model: str) -> Embeddings:
        if provider.name != "gemini":
            raise ValueError("Only Gemini remote embeddings are supported")
        keys = provider.api_keys
        if not keys:
            raise ValueError("GOOGLE_API_KEY missing")
        return GeminiEmbeddings(api_key=keys, model=model)

    def _embedding_candidates(self) -> list[tuple[AIProvider, str]]:
        return get_embedding_fallback_chain()

    def _persist_path(self) -> str:
        return self.disk_path_for_session(self._session_id)

    def touch_retention(self) -> None:
        path = Path(self._persist_path())
        try:
            if self.is_ready and not self._retired and not path.is_symlink() and path.is_dir():
                if time.time() - path.stat().st_mtime > 60:
                    os.utime(path, None)
        except OSError:
            logger.warning("Could not refresh session retention marker")

    def _try_load_from_disk(self) -> None:
        path = Path(self._persist_path())
        manifest = path / "metadata.json"
        if not manifest.is_file():
            return
        try:
            if (
                manifest.stat().st_size > 10000000
                or (path / "index.faiss").stat().st_size > 100000000
            ):
                return
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if data.get("schema_version") != 1:
                return
            if data.get("chunk_tokens") != self.settings.embedding_chunk_tokens or data.get("overlap_tokens") != self.settings.embedding_overlap_tokens:
                return
            index_bytes = (path / "index.faiss").read_bytes()
            if hashlib.sha256(index_bytes).hexdigest() != data["index_sha256"]:
                return
            spec = data["embedding"]
            if spec["provider"] == "local":
                emb = self._make_local_cpu_embeddings(spec["model"])
            else:
                candidate = next(
                    (
                        (p, m)
                        for p, m in self._embedding_candidates()
                        if p.name == spec["provider"] and m == spec["model"]
                    ),
                    None,
                )
                if candidate is None:
                    return
                emb = self._make_embeddings(*candidate)
            index = faiss.read_index(str(path / "index.faiss"))
            if index.d != data.get("dimensions"):
                return
            documents = {key: Document(**value) for key, value in data["documents"].items()}
            mapping = {int(key): value for key, value in data["mapping"].items()}
            self.vectorstore = FAISS(emb, index, InMemoryDocstore(documents), mapping)
            self.embeddings = emb
            self._embedding_spec = spec
        except (OSError, ValueError, KeyError, TypeError, RuntimeError):
            logger.warning("Session index could not be safely restored; upload documents again")

    def save_to_disk(self, store: FAISS | None = None, spec: dict[str, str] | None = None) -> None:
        store = store if store is not None else self.vectorstore
        spec = spec if spec is not None else self._embedding_spec
        if store is None or spec is None:
            return
        if self._retired:
            raise ValueError("Session has been reset")
        path = Path(self._persist_path())
        path.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=path) as temporary:
            temp = Path(temporary)
            faiss.write_index(store.index, str(temp / "index.faiss"))
            data = {
                "schema_version": 1,
                "dimensions": store.index.d,
                "normalization": "unit",
                "chunk_tokens": self.settings.embedding_chunk_tokens,
                "overlap_tokens": self.settings.embedding_overlap_tokens,
                "embedding": spec,
                "index_sha256": hashlib.sha256((temp / "index.faiss").read_bytes()).hexdigest(),
                "mapping": store.index_to_docstore_id,
                "documents": {
                    key: {"page_content": doc.page_content, "metadata": doc.metadata}
                    for key, doc in cast(InMemoryDocstore, store.docstore)._dict.items()
                },
            }
            (temp / "metadata.json").write_text(json.dumps(data), encoding="utf-8")
            os.replace(temp / "index.faiss", path / "index.faiss")
            os.replace(temp / "metadata.json", path / "metadata.json")

    def prepare_documents(self, documents: list[Document]):
        if self._retired:
            raise ValueError("Session has been retired")
        if not documents:
            raise ValueError("No readable document passages")
        candidates = self._embedding_candidates() if self.settings.embedding_use_remote else []
        for provider, model in candidates:
            try:
                emb = self._make_embeddings(provider, model)
                store = FAISS.from_documents(documents, emb)
                return store, emb, {"provider": provider.name, "model": model}, HybridIndex(documents)
            except Exception:
                logger.warning("Remote embedding index failed; trying next backend")
        emb = self._make_local_cpu_embeddings(LOCAL_EMBEDDING_MODEL)
        store = FAISS.from_documents(documents, emb)
        return store, emb, {"provider": "local", "model": LOCAL_EMBEDDING_MODEL}, HybridIndex(documents)

    def publish_documents(self, prepared) -> None:
        store, emb, spec, hybrid = prepared
        with self._write_lock:
            self.save_to_disk(store, spec)
            self.vectorstore, self.embeddings, self._embedding_spec = store, emb, spec
            self._hybrid = hybrid
            self._read_state = (store, hybrid)
            self.chat_service = None

    def create_from_documents(self, documents: list[Document]) -> int:
        with self.operation_lock:
            self.publish_documents(self.prepare_documents(documents))
        return len(documents)

    def discard_persisted_index_if_idle(self) -> None:
        if not self._write_lock.acquire(blocking=False):
            return
        try:
            path = Path(self._persist_path())
            root = Path(self.sessions_directory()).resolve()
            if not path.is_symlink() and path.resolve().parent == root and path.is_dir():
                shutil.rmtree(path)
        except OSError:
            logger.warning("Could not remove evicted session index")
        finally:
            self._write_lock.release()

    def similarity_search(self, query: str, k: int | None = None, *, balance_sources: bool = False,
                          anchor_query: str | None = None,
                          source_ids: frozenset[str] | None = None) -> list[Document]:
        if self.vectorstore is None:
            raise ValueError("Vector store not initialized. Upload a PDF first.")
        k = k or self.settings.retrieval_k
        state = self._read_state
        store = self.vectorstore
        if state is None or state[0] is not store:
            documents = [
                store.docstore.search(doc_id) for doc_id in store.index_to_docstore_id.values()
            ]
            state = (store, HybridIndex([doc for doc in documents if isinstance(doc, Document)]))
            self._read_state = state
        return rerank_documents(query, state[1].search(state[0], query, k=max(30, k),
                               balance_sources=balance_sources, anchor_query=anchor_query,
                               source_ids=source_ids))[:k]

    @property
    def document_files(self) -> list[dict[str, Any]]:
        store = self.vectorstore
        if store is None:
            return []
        groups: dict[str, dict[str, Any]] = {}
        for key in store.index_to_docstore_id.values():
            doc = store.docstore.search(key)
            if not isinstance(doc, Document):
                continue
            meta = doc.metadata
            identity = str(meta.get("document_id") or meta.get("source_file", "Document"))
            item = groups.setdefault(identity, {"file_name": str(meta.get("source_file", "Document")),
                                                "document_id": identity,
                                                "page_count": 0, "chunks_created": 0})
            item["chunks_created"] += 1
            page = meta.get("page")
            if isinstance(page, int):
                item["page_count"] = max(item["page_count"], page + 1)
            if meta.get("evidence_scope") == "partial_full_text":
                item["warnings"] = ["This restored document has partial extraction coverage."]
        return list(groups.values())

    @property
    def corpus_id(self) -> str | None:
        if self.vectorstore is None:
            return None
        store = self.vectorstore
        documents = [store.docstore.search(key) for key in store.index_to_docstore_id.values()]
        content = [(d.metadata, d.page_content) for d in documents if isinstance(d, Document)]
        return hashlib.sha256(json.dumps(content, sort_keys=True, default=str).encode()).hexdigest()

    @property
    def document_count(self) -> int:
        store = self.vectorstore
        if store is None:
            return 0
        documents = [
            store.docstore.search(doc_id) for doc_id in store.index_to_docstore_id.values()
        ]
        return len(
            {
                str(doc.metadata.get("document_id") or doc.metadata.get("source_file", "document"))
                for doc in documents
                if isinstance(doc, Document)
            }
        )

    def get_retriever(self, k: int | None = None):
        if self.vectorstore is None:
            raise ValueError("Vector store not initialized. Upload a PDF first.")
        k = k or self.settings.retrieval_k
        return self.vectorstore.as_retriever(search_kwargs={"k": k})

    @property
    def is_ready(self) -> bool:
        return self.vectorstore is not None

    def clear(self) -> None:
        self.chat_service = None
        self.vectorstore = None
        self.embeddings = None
        self._hybrid = None
        self._read_state = None
