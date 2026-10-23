import asyncio
import unittest
from unittest.mock import patch

from langchain_core.messages import AIMessage, AIMessageChunk

from app.config import AI_PROVIDERS
from app.services.answer_continuation import LIMIT_NOTICE, continuation_messages
from app.services.llm_service import LLMService

class ContinuationTests(unittest.TestCase):
    def test_a_model_stop_does_not_end_an_explicit_list_before_all_items(self):
        service = self.service()
        class Model:
            def __init__(self): self.calls = 0
            def invoke(self, *args, **kwargs):
                self.calls += 1
                return AIMessage(content="1. First [E1].\n2. Second [E1].\n" if self.calls == 1 else "3. Third [E1].", response_metadata={"finish_reason": "stop"})
        with patch.object(service, "_build_llm_with_key", return_value=Model()):
            answer, _, warnings = service.generate_text("System", "Write exactly 3 numbered paragraphs.", "Evidence", "fixture", "pdf_chat", 128)
        self.assertTrue(answer.endswith("3. Third [E1]."))
        self.assertEqual(warnings, [])

    def service(self, parts=3):
        service = LLMService()
        self.addCleanup(patch.stopall)
        patch.object(service.settings, "max_answer_parts", parts).start()
        attempts = [(AI_PROVIDERS["groq"], "fixture", "key", 5.0, "sig", 1)]
        patch.object(service, "_attempts", return_value=iter(attempts)).start()
        patch("app.services.llm_service.record_success").start()
        patch.object(service, "_failure").start()
        return service

    def test_json_continues_length_limited_answer_without_repeating_overlap(self):
        service = self.service()
        prefix = "The first supported paragraph is complete [E1].\n\n"
        class Model:
            def __init__(self): self.messages = []
            def invoke(self, messages, **kwargs):
                self.messages.append(messages)
                return AIMessage(content=prefix if len(self.messages) == 1 else prefix + "The final supported paragraph [E1].", response_metadata={"finish_reason": "length" if len(self.messages) == 1 else "stop"})
        model = Model()
        with patch.object(service, "_build_llm_with_key", return_value=model):
            answer, _, warnings = service.generate_text("System", "Question", "Evidence", "fixture", "pdf_chat", 128)
        self.assertEqual(answer, prefix + "The final supported paragraph [E1].")
        self.assertEqual(warnings, [])
        self.assertEqual(len(model.messages), 2)
        self.assertIn("untrusted_evidence", model.messages[1][1].content)

    def test_stream_displays_each_part_then_completes_only_once(self):
        service = self.service()
        class Model:
            def __init__(self): self.calls = 0
            async def astream(self, messages, **kwargs):
                self.calls += 1
                yield AIMessageChunk(content="First part [E1].\n\n" if self.calls == 1 else "Second part [E1].", response_metadata={"finish_reason": "length" if self.calls == 1 else "stop"})
        async def run():
            with patch.object(service, "_build_llm_with_key", return_value=Model()):
                return [event async for event in service.stream_text([], "fixture", "pdf_chat_stream", 128)]
        events = asyncio.run(run())
        self.assertEqual("".join(e["content"] for e in events if e["type"] == "token"), "First part [E1].\n\nSecond part [E1].")
        self.assertEqual(sum(e["type"] == "complete" for e in events), 1)
        self.assertEqual(events[1]["stage"], "continuation")
        self.assertEqual(events[-1]["warnings"], [])

    def test_part_cap_is_disclosed_and_cannot_be_cached_as_complete(self):
        service = self.service(parts=1)
        class Model:
            def invoke(self, *args, **kwargs):
                return AIMessage(content="Supported partial paragraph [E1].", response_metadata={"finish_reason": "length"})
        with patch.object(service, "_build_llm_with_key", return_value=Model()):
            answer, model, warnings = service.generate_text("System", "Question", "Evidence", "fixture", "pdf_chat", 128)
        self.assertIn(LIMIT_NOTICE, warnings)
        service._remember_answer("limited", answer, model, warnings)
        self.assertIsNone(service._cached_answer("limited"))

    def test_continuation_context_contains_only_a_bounded_tail(self):
        messages = continuation_messages([], "prefix " * 5000 + "END OF ANSWER")
        self.assertLess(len(messages[0].content), 2500)
        self.assertTrue(messages[0].content.endswith("END OF ANSWER"))

    def test_interrupted_continuation_recovers_without_provider_fallback(self):
        service = self.service()
        class Model:
            def __init__(self): self.calls = 0
            async def astream(self, messages, **kwargs):
                self.calls += 1
                if self.calls == 2:
                    raise RuntimeError("connection lost")
                yield AIMessageChunk(content="First supported part [E1].", response_metadata={"finish_reason": "length"})
        async def run():
            events = []
            with patch.object(service, "_build_llm_with_key", return_value=Model()):
                async for event in service.stream_text([], "fixture", "pdf_chat_stream", 128):
                    events.append(event)
            return events
        events = asyncio.run(run())
        self.assertTrue(any(e["type"] == "token" for e in events))
        self.assertEqual(sum(e["type"] == "complete" for e in events), 1)
        self.assertTrue(any(e.get("stage") == "recovery" for e in events))
