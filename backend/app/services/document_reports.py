"""Identify broad document requests and set depth from the available evidence."""

import re
from typing import Literal

ALL_DOCUMENTS = re.compile(
    r"\b(?:all|both|each|every)\s+(?:(?:of|the|two|three|four|five|[2-5]|uploaded|selected)\s+)*"
    r"(?:pdfs?|documents?|files?)\b",
    re.I,
)


def report_intent(question: str) -> Literal["summary", "comparison", "focused"]:
    if re.search(r"\b(?:compare|comparison|differences|similarities|across)\b", question, re.I):
        return "comparison"
    if ALL_DOCUMENTS.search(question) or re.search(
        r"\b(?:summarize|summary|overview|entire document)\b", question, re.I
    ):
        return "summary"
    return "focused"


def report_token_budget(source_count: int, maximum: int) -> int:
    count = max(1, min(source_count, 5))
    return min(maximum, {1: 1600, 2: 2400, 3: 2800, 4: 3200, 5: 3500}[count])


def report_depth(source_count: int, intent: str = "summary") -> str:
    targets = {1: "600-800", 2: "450-650", 3: "350-500", 4: "280-400", 5: "220-350"}
    words = targets.get(source_count)
    if words is None:
        return ""
    comparison_instructions = (
        " For comparisons, explain each source in depth before a separately cited synthesis "
        "of meaningful similarities and differences. Conclude with a structured Markdown comparison table "
        f"(e.g. under '## Key Differences Matrix' with one column for each of the {source_count} documents) "
        "systematically contrasting key roles, procedures, metrics, or obligations with [E#] citations in each data cell."
        if intent == "comparison"
        else " For comparisons, explain each source in depth before a separately cited synthesis of meaningful similarities and differences."
    )
    return (
        f"\nFor this multi-document report, cover all {source_count} sources with supplied evidence. "
        f"Unless the question specifies another format or length, give each source an unnumbered Markdown ## topic "
        f"heading and at least two substantive paragraphs. Aim for {words} words per source when supported. "
        "Put a blank line after headings and between paragraphs. Keep headings free of factual claims. "
        "Use distinct details, roles, conditions and procedures from the passages to explain what matters. "
        "Cite each factual paragraph or bullet. Leave unsupported material out instead of padding the answer "
        "or adding empty sections." + comparison_instructions
    )
