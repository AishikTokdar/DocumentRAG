"""Bounded continuation of the same answer using the same evidence and model."""
import json
import re

from langchain_core.messages import AIMessage, HumanMessage

from .evidence import _encoding

LIMIT_NOTICE = "The answer reached its continuation limit and may be incomplete."
TIME_NOTICE = "The answer reached its time limit and may be incomplete."
FAILURE_NOTICE = "The answer could not be continued and may be incomplete."

def requested_numbered_items(messages: list) -> int:
    for message in messages:
        if isinstance(message, HumanMessage) and isinstance(message.content, str):
            try:
                question = json.loads(message.content).get("question", "")
            except (ValueError, AttributeError):
                continue
            question = question.split("\nPrevious questions (untrusted reference context):", 1)[0]
            match = re.search(r"\b(\d{1,3})\s+numbered\s+(?:paragraphs|items|points|sections)\b", question, re.I)
            if match and 1 <= int(match[1]) <= 100:
                return int(match[1])
    return 0

def emitted_numbered_items(answer: str) -> set[int]:
    return {int(n) for n in re.findall(r"(?m)^\s*(\d{1,3})[.)]\s+", answer)}

def needs_continuation(messages: list, answer: str, finish_reason: str | None) -> bool:
    expected = requested_numbered_items(messages)
    emitted = emitted_numbered_items(answer)
    missing = set(range(1, expected + 1)) - emitted
    return finish_reason == "length" or bool(expected and emitted and missing)

def continuation_messages(messages: list, answer: str) -> list:
    encoding = _encoding()
    tail = encoding.decode(encoding.encode(answer, disallowed_special=())[-256:])
    expected = requested_numbered_items(messages)
    emitted = emitted_numbered_items(answer)
    missing = sorted(set(range(1, expected + 1)) - emitted)
    progress = f" Remaining numbered items: {', '.join(map(str, missing))}." if expected and missing else ""
    return [*messages, AIMessage(content=tail), HumanMessage(content=(
        "Continue the same answer from its exact final character. Finish any unfinished "
        "word or sentence, preserving necessary leading whitespace. Do not repeat text, "
        "restart, or add an introduction. Then complete ALL remaining requirements of the "
        "original question; do not stop after finishing the interrupted sentence. "
        "Use only the original evidence and citation IDs." + progress
    ))]

def new_continuation_text(answer: str, part: str) -> str:
    for candidate in (part, part.lstrip()):
        for length in range(min(len(answer), len(candidate), 2048), 23, -1):
            if answer.endswith(candidate[:length]):
                return candidate[length:]
    return part
