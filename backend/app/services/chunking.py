"""Use the retained MiniLM tokenizer to avoid silent embedding truncation."""

import re
from functools import lru_cache

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from transformers import AutoTokenizer

LOCAL_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

@lru_cache(maxsize=1)
def embedding_tokenizer():
    return AutoTokenizer.from_pretrained(LOCAL_EMBEDDING_MODEL, trust_remote_code=False)

def document_splitter(chunk_size: int = 224, overlap: int = 32):
    tokenizer = embedding_tokenizer()
    return RecursiveCharacterTextSplitter(
        chunk_size=min(254, chunk_size),
        chunk_overlap=min(overlap, chunk_size - 1),
        length_function=lambda text: len(tokenizer.encode(text, add_special_tokens=False, verbose=False)),
        separators=["\n\n", "\n", ". ", "; ", " ", ""],
    )

def format_breadcrumb(meta: dict) -> str:
    source = meta.get("source_file") or meta.get("document_id") or "Document"
    page = meta.get("page")
    page_label = f"Page {page + 1}" if isinstance(page, int) else "Page 1"
    section = meta.get("section")
    if section:
        clean_section = re.sub(r"^#{1,6}\s*", "", str(section)).strip()
        return f"[Document: {source} | {page_label} | Section: {clean_section}]"
    return f"[Document: {source} | {page_label}]"

def split_documents(
    documents: list[Document], chunk_size: int = 224, overlap: int = 32
) -> list[Document]:
    sections = []
    heading = re.compile(
        r"(?m)^(?:#{1,3}\s+.+|(?:\d+(?:\.\d+)*\.?\s+)?(?:Overview|Introduction|Scope|Definitions|Requirements|Procedure|Policy|Responsibilities|Appendix|References|Summary|Conclusions?))\s*$",
        re.I,
    )
    for doc in documents:
        matches = list(heading.finditer(doc.page_content))
        boundaries = sorted({0, *(match.start() for match in matches), len(doc.page_content)})
        for sec_idx, (start, end) in enumerate(zip(boundaries, boundaries[1:], strict=False)):
            text = doc.page_content[start:end].strip()
            if text:
                meta = dict(doc.metadata)
                if heading.match(text.splitlines()[0]):
                    meta["section"] = text.splitlines()[0]
                source_key = meta.get("source_file") or meta.get("document_id") or "doc"
                page_key = meta.get("page", 0)
                meta["parent_id"] = f"{source_key}:p{page_key}:s{sec_idx}"
                meta["parent_content"] = text
                sections.append(Document(page_content=text, metadata=meta))
    if not sections:
        return []
    chunks = document_splitter(chunk_size, overlap).split_documents(sections)
    for chunk in chunks:
        breadcrumb = format_breadcrumb(chunk.metadata)
        chunk.metadata["breadcrumb"] = breadcrumb
        chunk.metadata["child_content"] = chunk.page_content
        if not chunk.page_content.startswith("[Document:"):
            chunk.page_content = f"{breadcrumb}\n{chunk.page_content}"
    return chunks
