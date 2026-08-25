"""
LLM Service

Manages language model interactions with multi-provider support.
Implements ordered failover logic across OpenRouter, Groq, Gemini,
Hugging Face, and direct OpenAI for maximum reliability.

``generate_answer`` builds a small LCEL chain (prompt | llm | parser) each call;
``get_available_models`` aggregates static model lists from providers that have keys.
"""

import logging
import time
from collections.abc import AsyncGenerator
from typing import Any, cast

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

from ..config import (
    AI_PROVIDERS,
    PROVIDER_PRIORITY,
    AIProvider,
    get_default_provider,
    get_settings,
    provider_has_credentials,
)

logger = logging.getLogger(__name__)


class LLMService:
    """
    Service for LLM-based text generation.

    Features:
    - Multi-provider support (OpenRouter, Groq, OpenAI, Gemini, HuggingFace)
    - Automatic ordered failover on provider failure
    - RAG chain construction

    Usage:
        service = LLMService()
        answer, model, time_s = service.generate_answer(question, docs)
    """

    STRICT_RAG_PROMPT_TEMPLATE = """You are an expert, meticulous document analysis assistant.
Your task is to answer the user's question with utmost accuracy, relying EXCLUSIVELY on the provided document context.

Core Directives:
1. Grounding: Answer strictly using facts found within the provided Context. Do NOT hallucinate or incorporate outside knowledge.
2. Accuracy: If the provided Context does not contain the information required to answer the question, you must respond EXACTLY with: "I cannot find this information in the document."
3. Citations: Every single factual claim you make must be accompanied by a citation in the exact format [Source: DocName - Page X]. DO NOT include chunk numbers, paragraph numbers, or any other suffixes. Just the page number.
4. Clarity: Format your response clearly using markdown bullet points or paragraphs as appropriate for readability.
5. Conciseness: Be direct and avoid unnecessary conversational filler (e.g., do not say "Based on the text...").

Context:
{context}

Question: {question}

Answer: """

    HYBRID_RAG_PROMPT_TEMPLATE = """You are a highly intelligent, NotebookLM-style research and synthesis assistant.
Your objective is to provide a comprehensive, deeply insightful answer by fusing the provided document context with your extensive world knowledge and advanced reasoning capabilities.

Core Directives:
1. Document Priority: The provided document context is your primary source of truth. Always prioritize it and cite specific details using the exact format [Source: DocName - Page X]. DO NOT include chunk numbers, paragraph numbers, or any other suffixes. Just the page number.
2. Synthesis & Elaboration: Use your internal pretrained knowledge to elaborate on the context. Explain complex concepts, provide relevant background, clarify domain-specific terminology, and contextualize the document's findings.
3. Distinction: Make a clear distinction between facts explicitly stated in the document versus your own added background knowledge (e.g., "The document states... which aligns with the broader principle of...").
4. Depth: Analyze the implications of the text rather than just summarizing it. Connect the dots for the user.
5. Formatting: Use rich markdown formatting (headings, bold text, bullet points) to structure complex, multi-faceted answers logically.

Context:
{context}

Question: {question}

Answer: """

    RAG_PROMPT_TEMPLATE = HYBRID_RAG_PROMPT_TEMPLATE

    def __init__(self, model: str | None = None):
        self.settings = get_settings()
        self.model = model or self.settings.default_model

    # ------------------------------------------------------------------
    # Provider / LLM helpers
    # ------------------------------------------------------------------

    def _resolve_llm_api_keys(self, provider: AIProvider) -> list[str]:
        keys = provider.api_keys
        if keys:
            return keys
        s = self.settings
        if provider.name == "openrouter":
            return parse_api_keys(s.openrouter_api_key)
        if provider.name == "openai":
            return parse_api_keys(s.openai_direct_api_key)
        if provider.name == "groq":
            return parse_api_keys(s.groq_api_key)
        if provider.name == "gemini":
            return parse_api_keys(s.google_api_key)
        if provider.name == "huggingface":
            return parse_api_keys(s.hf_api_key)
        return []

    def _build_llm(self, provider: AIProvider, model_id: str, api_key: str | None = None) -> ChatOpenAI:
        """Create a ChatOpenAI instance pointing at the given provider and specific API key."""
        base_url = (
            self.settings.openrouter_api_base
            if provider.name == "openrouter"
            else provider.base_url
        )
        keys = self._resolve_llm_api_keys(provider)
        resolved_key = api_key or (keys[0] if keys else None)
        return ChatOpenAI(
            base_url=base_url,
            api_key=cast(Any, resolved_key),
            model=model_id,
            temperature=self.settings.temperature,
            max_tokens=self.settings.max_tokens,  # pyright: ignore[reportCallIssue]
        )

    def _find_provider_for_model(self, model: str) -> AIProvider | None:
        """Find which provider supports the given model."""
        for provider in AI_PROVIDERS.values():
            if model in provider.models and provider_has_credentials(provider):
                return provider
        return None

    def _get_llm(self, model: str | None = None) -> tuple[ChatOpenAI, str]:
        """Get LLM instance for the requested model."""
        target_model = model or self.model
        provider = self._find_provider_for_model(target_model)
        if not provider:
            provider = get_default_provider()
        return self._build_llm(provider, target_model), target_model

    # ------------------------------------------------------------------
    # Failover-aware generation
    # ------------------------------------------------------------------

    def _llm_attempt_sequence(self, preferred_model: str | None) -> list[tuple[AIProvider, str, str]]:
        """
        Build an exhaustive, ordered fallback chain containing all models supported by the project across all providers.
        Attempts:
        1. Selected preferred model (and other models of the preferred model's provider)
        2. Every other provider in priority order (Gemini, Groq, Cerebras, SambaNova, Hugging Face, OpenRouter), trying all supported models and credentialed keys for each provider.
        """
        seen: set[tuple[str, str, str]] = set()
        seq: list[tuple[AIProvider, str, str]] = []

        def add(p: AIProvider, mid: str) -> None:
            keys = self._resolve_llm_api_keys(p)
            if not keys or mid not in p.models:
                return
            for key in keys:
                entry_sig = (p.name, mid, key)
                if entry_sig not in seen:
                    seen.add(entry_sig)
                    seq.append((p, mid, key))

        if preferred_model:
            # User selection gets top priority
            pref_p = self._find_provider_for_model(preferred_model)
            if pref_p and preferred_model in pref_p.models:
                add(pref_p, preferred_model)
                for mid in pref_p.models:
                    if mid != preferred_model:
                        add(pref_p, mid)

        # Walk all providers in priority order
        for name in PROVIDER_PRIORITY:
            p = AI_PROVIDERS.get(name)
            if not p:
                continue
            for mid in p.models:
                add(p, mid)

        # Ensure all providers in AI_PROVIDERS dictionary are covered
        for name, p in AI_PROVIDERS.items():
            for mid in p.models:
                add(p, mid)

        return seq

    def _build_failover_error(self, failed_models: list[str]) -> RuntimeError:
        attempts_str = ", ".join(failed_models) if failed_models else "None"
        return RuntimeError(
            f"AI Generation Failed: All supported AI models and providers in the fallback chain were attempted ({attempts_str}) and failed. "
            "Please check your API keys or rate limit quota for configured providers (GOOGLE_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, SAMBANOVA_API_KEY, HF_API_KEY, OPENROUTER_API_KEY)."
        )

    def _generate_with_failover(
        self,
        question: str,
        context: str,
        preferred_model: str | None = None,
        hybrid_mode: bool = True,
    ) -> tuple[str, str]:
        """
        Try the preferred model first, then every other credentialed model in priority order.
        Returns (answer, model_used).
        """
        template_str = self.HYBRID_RAG_PROMPT_TEMPLATE if hybrid_mode else self.STRICT_RAG_PROMPT_TEMPLATE
        prompt = ChatPromptTemplate.from_template(template_str)
        payload = {"context": context, "question": question}
        attempts = self._llm_attempt_sequence(preferred_model)

        if not attempts:
            raise RuntimeError(
                "AI Generation Failed: No configured AI providers found. Please set at least one valid API key "
                "(e.g. GOOGLE_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, SAMBANOVA_API_KEY, HF_API_KEY, or OPENROUTER_API_KEY) in your backend environment or .env file."
            )

        failed_models: list[str] = []

        for provider, model_id, api_key in attempts:
            try:
                key_mask = f"...{api_key[-4:]}" if len(api_key) > 4 else "key"
                if failed_models:
                    logger.info(
                        "Failover switch: previous attempts %s failed. Trying provider %s (%s, key %s)...",
                        failed_models, provider.name, model_id, key_mask,
                    )
                llm = self._build_llm(provider, model_id, api_key)
                chain = prompt | llm | StrOutputParser()
                answer = chain.invoke(payload)
                logger.info("LLM succeeded: %s / %s", provider.name, model_id)
                from .model_health import record_success
                record_success(model_id)
                return answer, model_id
            except Exception as exc:
                key_mask = f"...{api_key[-4:]}" if len(api_key) > 4 else "key"
                failed_models.append(f"{provider.name}/{model_id}[{key_mask}]")
                logger.warning("LLM %s/%s [%s] failed: %s", provider.name, model_id, key_mask, exc)
                from .model_health import record_failure
                record_failure(model_id)

        raise self._build_failover_error(failed_models)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def _format_docs(docs: list[Document]) -> str:
        """Format retrieved documents into context string with document filename and page info."""
        formatted_chunks = []
        for doc in docs:
            fname = doc.metadata.get("source_file") or doc.metadata.get("file_name") or "PDF Document"
            page = doc.metadata.get("page", 0)
            p_display = page + 1 if isinstance(page, int) else page
            formatted_chunks.append(
                f"[Source: {fname} - Page {p_display}]\n{doc.page_content}"
            )
        return "\n\n---\n\n".join(formatted_chunks)

    def generate_answer(
        self,
        question: str,
        context_docs: list[Document],
        model: str | None = None,
        hybrid_mode: bool = True,
    ) -> tuple[str, str, float]:
        """
        Generate an answer using RAG with automatic failover.
        Splits prompt into N batches if context is too large.
        Returns:
            Tuple of (answer, model_used, processing_time_seconds)
        """
        start_time = time.time()
        
        MAX_CHUNKS_PER_BATCH = 4
        if len(context_docs) > MAX_CHUNKS_PER_BATCH:
            batches = [context_docs[i:i + MAX_CHUNKS_PER_BATCH] for i in range(0, len(context_docs), MAX_CHUNKS_PER_BATCH)]
        else:
            batches = [context_docs]
            
        full_answer = []
        final_model_used = None
        total_parts = len(batches)
        
        for i, batch in enumerate(batches):
            context = self._format_docs(batch)
            ans, mod = self._generate_with_failover(
                question, context, model or self.model, hybrid_mode=hybrid_mode
            )
            final_model_used = mod
            if total_parts > 1:
                full_answer.append(f"### Part {i+1} of {total_parts}\n{ans}")
            else:
                full_answer.append(ans)
                
        processing_time = time.time() - start_time
        return "\n\n".join(full_answer), final_model_used or "", processing_time

    async def stream_answer_with_failover(
        self,
        question: str,
        context_docs: list[Document],
        model: str | None = None,
        hybrid_mode: bool = True,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream answer tokens from providers in failover order.
        Splits context into N batches if context is too large.
        Yields dict events:
            {"type": "status", "stage": "failover", "message": "..."}
            {"type": "token", "content": "...", "model_used": "..."}
            {"type": "complete", "model_used": "..."}
        """
        template_str = self.HYBRID_RAG_PROMPT_TEMPLATE if hybrid_mode else self.STRICT_RAG_PROMPT_TEMPLATE
        prompt = ChatPromptTemplate.from_template(template_str)
        attempts = self._llm_attempt_sequence(model or self.model)

        if not attempts:
            raise RuntimeError(
                "AI Generation Failed: No configured AI providers found. Please set at least one valid API key "
                "(e.g. GOOGLE_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, SAMBANOVA_API_KEY, HF_API_KEY, or OPENROUTER_API_KEY) in your backend environment or .env file."
            )

        MAX_CHUNKS_PER_BATCH = 4
        if len(context_docs) > MAX_CHUNKS_PER_BATCH:
            batches = [context_docs[i:i + MAX_CHUNKS_PER_BATCH] for i in range(0, len(context_docs), MAX_CHUNKS_PER_BATCH)]
        else:
            batches = [context_docs]
            
        total_parts = len(batches)
        final_model_used = None

        for i, batch in enumerate(batches):
            context = self._format_docs(batch)
            payload = {"context": context, "question": question}
            
            if total_parts > 1:
                yield {
                    "type": "status",
                    "stage": "generating",
                    "message": f"Answer generation split into {total_parts} parts. Generating part {i+1}/{total_parts}..."
                }
                prefix = f"### Part {i+1} of {total_parts}\n\n" if i == 0 else f"\n\n---\n### Part {i+1} of {total_parts}\n\n"
                yield {
                    "type": "token",
                    "content": prefix,
                    "model_used": None,
                }

            failed_models: list[str] = []
            part_succeeded = False

            for idx, (provider, model_id, api_key) in enumerate(attempts):
                key_mask = f"...{api_key[-4:]}" if len(api_key) > 4 else ""
                if idx > 0:
                    yield {
                        "type": "status",
                        "stage": "failover",
                        "message": f"Switching AI provider / key: Previous model failed. Trying {provider.name.title()} ({model_id.split('/')[-1]} {key_mask})...",
                        "provider": provider.name,
                        "model": model_id,
                    }

                try:
                    llm = self._build_llm(provider, model_id, api_key)
                    chain = prompt | llm | StrOutputParser()
                    got_tokens = False

                    async for chunk in chain.astream(payload):
                        text = chunk if isinstance(chunk, str) else str(chunk)
                        if text:
                            got_tokens = True
                            yield {
                                "type": "token",
                                "content": text,
                                "model_used": model_id,
                            }

                    if got_tokens:
                        logger.info("LLM stream succeeded for part %d: %s / %s", i+1, provider.name, model_id)
                        from .model_health import record_success
                        record_success(model_id)
                        final_model_used = model_id
                        part_succeeded = True
                        break
                except Exception as exc:
                    failed_models.append(f"{provider.name}/{model_id}[{key_mask}]")
                    logger.warning(
                        "LLM stream %s/%s [%s] failed for part %d: %s", provider.name, model_id, key_mask, i+1, exc
                    )
                    from .model_health import record_failure
                    record_failure(model_id)

            if not part_succeeded:
                raise self._build_failover_error(failed_models)
                
            if total_parts > 1:
                yield {
                    "type": "status",
                    "stage": "generating",
                    "message": f"Answer generation split into {total_parts} parts. {i+1}/{total_parts} completed."
                }

        yield {"type": "complete", "model_used": final_model_used}

    def create_rag_chain(self, retriever, model: str | None = None):
        """Create a complete RAG chain with retriever."""
        llm, _ = self._get_llm(model)
        prompt = ChatPromptTemplate.from_template(self.RAG_PROMPT_TEMPLATE)
        chain = (
            {
                "context": retriever | self._format_docs,
                "question": RunnablePassthrough(),
            }
            | prompt
            | llm
            | StrOutputParser()
        )
        return chain

    @staticmethod
    def get_available_models() -> list[dict]:
        """Get list of all models across providers with availability status."""
        from .model_health import is_model_healthy
        settings = get_settings()
        models = []
        for provider in AI_PROVIDERS.values():
            has_key = provider_has_credentials(provider)
            for model_id in provider.models:
                models.append({
                    "id": model_id,
                    "name": model_id.split("/")[-1].replace("-", " ").title(),
                    "provider": provider.name,
                    "is_default": model_id == settings.default_model,
                    "is_available": has_key and is_model_healthy(model_id),
                    "api_key_env": provider.api_key_env,
                })
        return models
