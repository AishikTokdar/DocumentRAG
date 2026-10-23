import unittest
from app.config import parse_api_keys, AIProvider, get_settings, AI_PROVIDERS, PROVIDER_PRIORITY, DEFAULT_MODEL
from app.services.embedding_clients import GeminiEmbeddings, GroqEmbeddings

class TestMultiKeyAndGeminiDefaults(unittest.TestCase):
    def test_parse_api_keys(self):
        self.assertEqual(parse_api_keys("key1"), ["key1"])
        self.assertEqual(parse_api_keys("key1, key2, key3"), ["key1", "key2", "key3"])
        self.assertEqual(parse_api_keys("key1; key2  key3"), ["key1", "key2", "key3"])
        self.assertEqual(parse_api_keys("key1, key2, key1, key3"), ["key1", "key2", "key3"])
        self.assertEqual(parse_api_keys(""), [])
        self.assertEqual(parse_api_keys(None), [])

    def test_gemini_defaults(self):
        settings = get_settings()
        self.assertEqual(settings.default_model, DEFAULT_MODEL)
        self.assertEqual(settings.default_provider, "gemini")
        self.assertEqual(PROVIDER_PRIORITY[0], "gemini")
        self.assertIn("gemini", AI_PROVIDERS)
        self.assertIn(DEFAULT_MODEL, AI_PROVIDERS["gemini"].models)

    def test_embedding_multi_keys(self):
        gem_emb = GeminiEmbeddings(api_key=["key1", "key2"], model="gemini-embedding-001")
        self.assertEqual(gem_emb._keys, ["key1", "key2"])

    def test_paid_providers_cannot_be_reenabled_by_old_settings(self):
        import os
        from unittest.mock import patch
        from app.config import Settings, provider_is_allowed, get_all_provider_api_keys
        with patch.dict(os.environ, {"ALLOW_CREDIT_PROVIDERS": "true", "HF_TOKEN": "test", "SAMBANOVA_API_KEY": "test"}):
            for name in ("openai", "huggingface", "cerebras", "sambanova"):
                self.assertNotIn(name, AI_PROVIDERS)
                self.assertEqual(get_all_provider_api_keys(name, "custom"), [])
                self.assertFalse(provider_is_allowed(AIProvider(name, "https://example.invalid", "TEST", ["paid"], access_tier="credits")))
            settings = Settings(_env_file=None, default_provider="sambanova", default_model="retired")
            self.assertEqual(settings.default_provider, "gemini")
            self.assertEqual(settings.default_model, DEFAULT_MODEL)

    def test_catalogue_and_failover_remain_free_only(self):
        from app.config import provider_is_allowed
        from app.services.llm_service import LLMService
        from unittest.mock import patch
        self.assertEqual(set(AI_PROVIDERS), {"gemini", "groq", "openrouter"})
        self.assertTrue(all(provider_is_allowed(p) for p in AI_PROVIDERS.values()))
        self.assertTrue(all(m == "openrouter/free" or m.endswith(":free") for m in AI_PROVIDERS["openrouter"].models))
        with patch.object(LLMService, "_resolve_llm_api_keys", return_value=["fixture-key"]):
            attempts = LLMService()._llm_attempt_sequence("paid/unknown")
        self.assertTrue(attempts)
        self.assertTrue(all(model in provider.models for provider, model in attempts))

    def test_llm_attempt_sequence_fallback(self):
        from app.services.llm_service import LLMService
        service = LLMService()
        attempts = service._llm_attempt_sequence(DEFAULT_MODEL)
        self.assertIsInstance(attempts, list)
        if attempts:
            provider, model_id = attempts[0]
            api_key = service._resolve_llm_api_keys(provider)[0]
            self.assertIsNotNone(provider)
            self.assertIsNotNone(model_id)
            self.assertIsNotNone(api_key)

if __name__ == "__main__":
    unittest.main()
