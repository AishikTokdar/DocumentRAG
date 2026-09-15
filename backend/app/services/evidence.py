"""Local evidence selection, token accounting, and citation resolution."""

import hashlib
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from urllib.parse import urlsplit

import tiktoken
from langchain_core.documents import Document


@lru_cache(maxsize=1)
def _encoding():
    return tiktoken.get_encoding("cl100k_base")

def token_count(text: str) -> int:
    return len(_encoding().encode(text, disallowed_special=()))

def truncate_tokens(text: str, budget: int) -> str:
    encoding = _encoding()
    return encoding.decode(encoding.encode(text, disallowed_special=())[:budget])

def terms(text: str) -> set[str]:
    return set(re.findall(r"[\w-]{2,}", text.lower()))

def rank_evidence(query: str, documents: list[Document]) -> list[Document]:
    query_terms = terms(query)
    lexical = sorted(
        range(len(documents)),
        key=lambda i: len(query_terms & terms(documents[i].page_content)),
        reverse=True,
    )
    lexical_rank = {index: rank for rank, index in enumerate(lexical)}
    return [
        documents[i]
        for i in sorted(
            range(len(documents)),
            key=lambda i: 1 / (60 + i + 1) + 1 / (60 + lexical_rank[i] + 1),
            reverse=True,
        )
    ]

def document_identity(metadata: dict) -> str:
    return str(metadata.get("document_id") or metadata.get("source_file") or "Document")

def fit_evidence(documents: list[Document], budget: int, *, limit: int | None = None) -> list[Document]:
    kept: list[Document] = []
    seen: set[tuple[str, str]] = set()
    for doc in documents:
        if limit is not None and len(kept) >= limit:
            break
        source = str(
            doc.metadata.get("paper_id")
            or doc.metadata.get("document_id")
            or doc.metadata.get("source_file")
            or doc.metadata.get("source", "")
        )
        digest = hashlib.sha256(" ".join(doc.page_content.split()).encode()).hexdigest()
        key = (source, digest)
        if key in seen:
            continue
        cost = token_count(format_evidence(kept + [doc])[0])
        if cost > budget:
            continue
        kept.append(doc)
        seen.add(key)
    return kept

def format_evidence(documents: list[Document]) -> tuple[str, dict[str, str]]:
    blocks = []
    sources: dict[str, str] = {}
    citations = {}
    title_ids: dict[str, set[str]] = defaultdict(set)
    def clean_title(meta: dict) -> str:
        return re.sub(r"[\[\]<>\n\r]", " ", str(meta.get("source_file") or "Document"))
    for d in documents:
        title_ids[clean_title(d.metadata)].add(str(d.metadata.get("document_id", "")))
    for i, doc in enumerate(documents, 1):
        evidence_id = f"E{i}"
        meta = doc.metadata
        title = clean_title(meta)
        if len(title_ids[title]) > 1 and meta.get("document_id"):
            title += " (" + str(meta["document_id"])[:8] + ")"
        page = meta.get("page")
        label = f"{title} - Page {page + 1}" if isinstance(page, int) else title
        url = str(meta.get("source", ""))
        try:
            safe_url = urlsplit(url).scheme in {"https", "http"} and bool(urlsplit(url).hostname)
        except ValueError:
            safe_url = False
        citations[evidence_id] = (
            f"[{label}]({url.replace(' ', '%20').replace(')', '%29')})"
            if safe_url
            else f"[{label}]"
        )
        source_key = str(meta.get("document_id") or meta.get("source_file") or title)
        if source_key not in sources:
            sources[source_key] = f"P{len(sources) + 1}"
            blocks.append(
                f"Source {sources[source_key]}: {title}"
            )
        scope = meta.get("evidence_scope", "full_text")
        location = f"; page={page + 1}" if isinstance(page, int) else ""
        blocks.append(
            f"[{evidence_id}] document={sources[source_key]}{location}; scope={scope}\n{doc.page_content}"
        )
    return "\n\n".join(blocks), citations

OMITTED_PASSAGE = "Insufficient evidence to verify this passage"
_CITATION_IDS = r"E\d+(?:[ \t]*[,;/][ \t]*E\d+)*"
_CITATION_GROUP = re.compile(
    rf"\[({_CITATION_IDS})\]|\(({_CITATION_IDS})\)|【({_CITATION_IDS})】", re.I
)

def _normalize_citations(answer: str) -> str:
    return _CITATION_GROUP.sub(
        lambda match: " ".join(f"[{ref}]" for ref in re.findall(r"E\d+", match[0].upper())),
        answer,
    )

def resolve_citations(answer: str, citations: dict[str, str]) -> str:
    answer = _normalize_citations(answer)
    answer = re.sub(r'(?<=[\w)*\x60"\u201d\u2019])(?=\[E\d+\])', " ", answer)

    def replace(match: re.Match) -> str:
        labels = (citations.get(ref, "[unverified source]") for ref in re.findall(r"E\d+", match[0]))
        return " ".join(dict.fromkeys(labels))

    return re.sub(r"(?:\[E\d+\][ \t]*(?=\[E\d+\]))*\[E\d+\](?:[ \t]+(?=[.,;:!?]))?", replace, answer)

def numeric_literals(text: str) -> set[str]:
    text = re.sub(r"https?://\S+", "", text).replace("−", "-")
    result = set()
    pattern = r"(?<![\w.])([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(\s*%|\s+percent\b)?(?!\w|\.\d)"
    for match in re.finditer(pattern, text, re.I):
        try:
            number = Decimal(match[1].replace(",", ""))
            exponent = number.as_tuple().exponent
            if not isinstance(exponent, int) or abs(exponent) > 308:
                value = str(number)
            else:
                value = format(number, "f")
                if "." in value:
                    value = value.rstrip("0").rstrip(".")
        except InvalidOperation:
            value = match[1]
        result.add(value + ("%" if match[2] else ""))
    return result

def measurements(text: str) -> set[tuple[str, str]]:
    found = set()
    for m in re.finditer(r"([+\-\u2212]?(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(days?|months?|years?|hours?|minutes?|degrees?|kg|mg|km|cm|mm|meters?|metres?|dollars?|USD|EUR|GBP)\b", text, re.I):
        unit = m[2].casefold().rstrip("s")
        unit = {"dollar": "usd", "metre": "meter"}.get(unit, unit)
        found.add((next(iter(numeric_literals(m[1]))), unit))
    return found

_IDENTIFIER = re.compile(r"\b[A-Z0-9]+(?:[-\u2010\u2011\u2012\u2013\u2014\u2212][A-Z0-9]+)+\b")

def evidence_identifiers(text: str) -> set[str]:
    return {match[0] for match in _IDENTIFIER.finditer(text)
            if any(c.isalpha() for c in match[0]) and any(c.isdigit() for c in match[0])}

def restore_identifier_spelling(text: str, source: str) -> str:
    originals: dict[str, set[str]] = defaultdict(set)
    for identifier in evidence_identifiers(source):
        originals[re.sub(r"[\u2010-\u2014\u2212]", "-", identifier)].add(identifier)
    def restore(match: re.Match) -> str:
        forms = originals.get(re.sub(r"[\u2010-\u2014\u2212]", "-", match[0]), set())
        return next(iter(forms)) if len(forms) == 1 else match[0]
    return _IDENTIFIER.sub(restore, text)

def polarity_conflict(claim: str, source: str) -> bool:
    negative = re.compile(r"\b(?:excludes?|excluded|not covered|does not cover|must not|prohibited|forbidden)\b", re.I)
    positive = re.compile(r"\b(?:covers?|covered|includes?|included|allowed|permitted)\b", re.I)
    for sentence in re.split(r"[.!?\n]", source):
        if len((terms(claim) & terms(sentence)) - {"the", "is", "are", "for", "and"}) >= 2:
            if negative.search(sentence) and positive.search(claim) and not negative.search(claim):
                return True
    return False


def _claim_units(prose: str) -> list[str]:
    if prose.strip().startswith("|"):
        cells = prose.strip().strip("|").split("|")
        refs = set(re.findall(r"\[E\d+\]", prose))
        row_reference = " " + next(iter(refs)) if len(refs) == 1 else ""
        data_cells = cells if len(refs) == 1 and re.search(r"\[E\d+\]", cells[-1]) else cells[1:]
        return [cell.strip() + (row_reference if not re.search(r"\[E\d+\]", cell) else "")
                for cell in data_cells if cell.strip() and cell.strip() not in {"—", "-", "N/A"}]
    groups = list(re.finditer(r"(?:\[E\d+\][ \t]*)+", prose))
    if len(groups) < 2:
        return [prose]
    units = []
    start = 0
    for group in groups:
        units.append(prose[start:group.end()])
        start = group.end()
    tail = prose[start:]
    if re.search(r"\w", tail):
        units[-1] += tail
    return units


def _neutral_title(text: str, documents: list[Document], *, topic: bool = False) -> str:
    for doc in documents:
        name = str(doc.metadata.get("source_file", ""))
        if name:
            text = text.replace(name, "Document")
    if topic:
        text = re.sub(r"\b(?:Clause|Article|Appendix|Chapter|Table|Figure|Section)\s+\d+(?:\.\d+)*\b", "", text, flags=re.I)
    if topic:
        text = re.sub(r"\b(?:Part|Section)\s*\d+\b", "", text, flags=re.I)
    return re.sub(r"\b(?:Source|Document|P|PDF)\s*\d+\b|\([PS]\d+\)", "", text, flags=re.I)


def _attribution_issue(claim: str, refs: list[str], documents: list[Document]) -> bool:
    cited_ids = {document_identity(documents[int(ref[1:]) - 1].metadata)
                 for ref in refs if 0 < int(ref[1:]) <= len(documents)}
    ordered = list(dict.fromkeys(document_identity(doc.metadata) for doc in documents))
    for label in re.findall(r"\b(?:Document|PDF|Source)\s+(\d+)\b", claim, re.I):
        index = int(label) - 1
        if index >= len(ordered) or ordered[index] not in cited_ids:
            return True
    for doc in documents:
        name = str(doc.metadata.get("source_file", ""))
        if name and name.casefold() in claim.casefold() and document_identity(doc.metadata) not in cited_ids:
            return True
    speculative = re.search(
        r"\b(?:document|policy|manual|report|authors?|paper|framework)\s+"
        r"(?:likely|probably|possibly|may|might)\s+(?:use|employ|adopt|require|acknowledge)\w*"
        r"|\b(?:title|metadata)\b[^.!?\n]{0,80}\b(?:impli|suggest)\w*", claim, re.I,
    )
    if speculative:
        return not any(speculative[0].casefold() in doc.page_content.casefold()
                       for doc in documents if document_identity(doc.metadata) in cited_ids)
    return False


def _background_scope(block: str, current: bool) -> bool:
    for marks, title in re.findall(r"(?m)^(#{1,6})\s+([^\n]+)", block):
        if title.strip().casefold() == "background knowledge":
            current = True
        elif len(marks) <= 2:
            current = False
    return current


def _document_attribution(text: str, documents: list[Document]) -> bool:
    return bool(re.search(
        r"\b(?:the|this|uploaded|selected)\s+(?:document|pdf|policy|manual|report)\b"
        r"|\b(?:Document|PDF|Source)\s+\d+\b", text, re.I,
    )) or any(str(doc.metadata["source_file"]).casefold() in text.casefold()
              for doc in documents if doc.metadata.get("source_file"))


def _normalize_background_heading(answer: str) -> str:
    return re.sub(r"(?im)^[ \t]*\*\*(Background knowledge)\*\*:?[ \t]*$", r"## \1", answer)

def _ground_answer_strict(
    answer: str,
    citations: dict[str, str],
    documents: list[Document] | None = None,
    *,
    allow_background: bool = False,
) -> str:
    answer = _normalize_background_heading(_normalize_citations(answer))
    ids = set(re.findall(r"\[(E\d+)\]", answer))
    if ids - citations.keys() or re.search(r"\[(?:Paper\s*|P)\d+\]", answer, re.I):
        return "I cannot verify this response because it cited evidence that was not supplied."
    if not ids and not (allow_background and re.search(r"(?im)^## Background knowledge\s*$", answer)) and not re.search(
        r"insufficient evidence|cannot find|not provided|not available|not enough evidence",
        answer,
        re.I,
    ):
        return "I cannot provide a grounded answer: the generated response did not cite the supplied evidence."
    answer = re.sub(
        r"\[([^\]]+)\]\(https?://[^)]+\)",
        lambda match: f"[{match[1]}]" if match[1] in citations else match[1],
        answer,
    )
    answer = re.sub(r"https?://[^\s<>]+", "[unverified URL removed]", answer)
    if documents is not None:
        evidence = {
            f"E{i}": re.sub(r"(?m)^\[Document:[^\n]*\]\s*", "", doc.page_content) + "\n" + str(doc.metadata.get("year", ""))
            for i, doc in enumerate(documents, 1)
        }
        lines = answer.splitlines()
        table_headers = {
            line.strip()
            for i, line in enumerate(lines[:-1])
            if line.strip().startswith("|") and re.fullmatch(r"[\s|:-]+", lines[i + 1])
        }
        heading_background = False
        for line in answer.splitlines():
            heading_background = _background_scope(line, heading_background)
            match = re.fullmatch(r"(?:#{1,6}\s+|\*\*)(.+?)(?:\*\*)?", line)
            if not match:
                continue
            heading = match[1]
            if allow_background and heading_background and not _document_attribution(heading, documents) and not re.search(r"\[E\d+\]", heading):
                continue
            heading = re.sub(r"^\d+[.)]\s+", "", heading)
            heading = _neutral_title(heading, documents, topic=True)
            if re.search(r"\b(is|are|was|were|covers?|excludes?|must|will|has|have)\b|\d", heading, re.I) and not re.search(r"\[E\d+\]", heading):
                return "I cannot verify this response: a factual heading did not cite evidence."
        blocks = re.split(r"\n\s*\n|\n(?=\s*(?:[-*] |\d+[.)] |\|))", answer)
        background = False
        for block in blocks:
            background = _background_scope(block, background)
            prose = "\n".join(
                line
                for line in block.splitlines()
                if not ((line.lstrip().startswith("#") or re.fullmatch(r"(?:[-*]\s+)?\*\*[^*]+\*\*[:.]?", line.strip())) and not re.search(r"\[E\d+\]", line))
                and line.strip() not in table_headers
                and not re.fullmatch(r"[\s|:-]+", line)
            )
            prose = prose.strip()
            if not prose:
                continue
            refs = re.findall(r"\[(E\d+)\]", prose)
            if allow_background and background and not refs:
                if _document_attribution(prose, documents):
                    return "I cannot verify this response: document findings cannot be relabeled as background knowledge."
                continue
            abstention = re.fullmatch(
                r"(?:[-*]\s*)?(?:Insufficient evidence(?:[:\s]+[^.!?\n]*)?|I cannot find[^.]*|Not (?:provided|available)[^.]*)[.!]?",
                prose,
                re.I,
            )
            if not refs and not abstention:
                return "I cannot provide a grounded answer: a factual passage did not cite the supplied evidence."
            if refs:
              for unit in _claim_units(prose):
                unit_refs = re.findall(r"\[(E\d+)\]", unit)
                if not unit_refs:
                    return "I cannot provide a grounded answer: a table data cell did not cite evidence."
                source = " ".join(evidence.get(ref, "") for ref in unit_refs)
                repaired = restore_identifier_spelling(unit, source)
                if _attribution_issue(repaired, unit_refs, documents):
                    return "I cannot verify this response: a claim was attributed to unsupported evidence."
                answer = answer.replace(unit, repaired, 1)
                claim = re.sub(r"\[E\d+\]", "", repaired)
                claim = _neutral_title(claim, documents)
                claim = re.sub(r"(?m)^\s*(?:#{1,6}\s+)?(?:\d+[.)]\s+)?", "", claim)
                claim = re.sub(r"(?m)^\s*(?:[-*]\s+)?\(?\d+\)\s+", "", claim)
                ordinals = list(re.finditer(r"\((\d+)\)(?=\s)", claim))
                if len(ordinals) >= 2 and [int(match[1]) for match in ordinals] == list(range(1, len(ordinals) + 1)):
                    prefix = claim[:ordinals[0].start()].rstrip()
                    if prefix.endswith(":") or re.search(r"\b(?:consists\s+of|includes?|(?:steps?|stages?|components?)\s+are)$", prefix, re.I):
                        claim = re.sub(r"\(\d+\)(?=\s)", "", claim)
                numbers = numeric_literals(claim)
                if evidence_identifiers(claim) - evidence_identifiers(source):
                    return "I cannot verify this response: an identifier is absent from its cited evidence."
                supported = numeric_literals(source)
                for quote in re.findall(r'["\u201c]([^"\u201d\n]{3,})["\u201d]', claim):
                    if " ".join(quote.split()).casefold() not in " ".join(source.split()).casefold():
                        return "I cannot verify this response: a quotation differs from evidence."
                if polarity_conflict(claim, source):
                    return "I cannot verify this response: the claim contradicts cited evidence."
                if measurements(claim) - measurements(source):
                    return "I cannot verify this response: a quantity or unit differs from evidence."
                if numbers - supported:
                    return "I cannot verify this response: a numerical claim is absent from its cited evidence."
    return resolve_citations(answer, citations)

def ground_answer(
    answer: str,
    citations: dict[str, str],
    documents: list[Document] | None = None,
    *,
    allow_background: bool = False,
    preserve_valid_blocks: bool = False,
) -> str:
    if not preserve_valid_blocks:
        return _ground_answer_strict(answer, citations, documents, allow_background=allow_background)
    answer = _normalize_background_heading(_normalize_citations(answer))
    lines = answer.splitlines()
    headers = {
        line.strip() for i, line in enumerate(lines[:-1])
        if line.strip().startswith("|") and re.fullmatch(r"[\s|:-]+", lines[i + 1])
    }
    blocks = re.split(r"(\n\s*\n|\n(?=\s*(?:#{1,6} |[-*] |\d+[.)] |\|)))", answer)
    kept = []
    background = False
    for index, block in enumerate(blocks):
        if index % 2 or not block.strip() or block.strip() in headers or re.fullmatch(r"[\s|:-]+", block):
            kept.append(block)
            continue
        heading = re.fullmatch(r"#{1,6}\s+([^\n]+)", block)
        background = _background_scope(block, background)
        if heading and allow_background and background and not _document_attribution(block, documents or []) and not re.search(r"\[E\d+\]", block):
            kept.append(block)
            continue
        if heading and not re.search(
            r"\b(is|are|was|were|covers?|excludes?|must|will|has|have)\b|\d|\[E", _neutral_title(block, documents or [], topic=True), re.I
        ):
            kept.append(block)
            continue
        prefix = "## Background knowledge\n\n" if allow_background and background and not heading else ""
        checked = _ground_answer_strict(prefix + block, citations, documents, allow_background=allow_background)
        if prefix and checked.startswith(prefix):
            checked = checked[len(prefix):]
        if checked.startswith(("I cannot verify", "I cannot provide")):
            if block.strip().startswith("|"):
                cells = max(1, len(block.strip().strip("|").split("|")))
                kept.append("| " + OMITTED_PASSAGE + " |" + " — |" * (cells - 1))
            else:
                kept.append(OMITTED_PASSAGE + ".")
        else:
            kept.append(checked)
    return "".join(kept)
