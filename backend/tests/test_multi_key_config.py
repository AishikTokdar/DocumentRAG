import unittest
from app.config import parse_api_keys, AIProvider, get_settings, AI_PROVIDERS, PROVIDER_PRIORITY
from app.services.embedding_clients import GeminiEmbeddings, GroqEmbeddings

class TestMultiKeyAndGeminiDefaults(unittest.TestCase):
    def test_parse_api_keys(self):
        # Single key
        self.assertEqual(parse_api_keys("key1"), ["key1"])
        # Comma separated
        self.assertEqual(parse_api_keys("key1, key2, key3"), ["key1", "key2", "key3"])
        # Semicolon and space separated
        self.assertEqual(parse_api_keys("key1; key2  key3"), ["key1", "key2", "key3"])
        # Deduplication
        self.assertEqual(parse_api_keys("key1, key2, key1, key3"), ["key1", "key2", "key3"])
        # Empty input
        self.assertEqual(parse_api_keys(""), [])
        self.assertEqual(parse_api_keys(None), [])

    def test_gemini_defaults(self):
        settings = get_settings()
        self.assertEqual(settings.default_model, "gemini-3.5-flash")
        self.assertEqual(settings.default_provider, "gemini")
        self.assertEqual(PROVIDER_PRIORITY[0], "gemini")
        self.assertIn("gemini", AI_PROVIDERS)
        self.assertIn("gemini-3.5-flash", AI_PROVIDERS["gemini"].models)

    def test_embedding_multi_keys(self):
        gem_emb = GeminiEmbeddings(api_key=["key1", "key2"], model="gemini-embedding-001")
        self.assertEqual(gem_emb._keys, ["key1", "key2"])

    def test_hf_token_resolution(self):
        import os
        old_val = os.environ.get("HF_TOKEN")
        try:
            os.environ["HF_TOKEN"] = "hf_test_token_123"
            hf_prov = AI_PROVIDERS["huggingface"]
            self.assertIn("hf_test_token_123", hf_prov.api_keys)
        finally:
            if old_val is not None:
                os.environ["HF_TOKEN"] = old_val
            else:
                os.environ.pop("HF_TOKEN", None)

    def test_llm_attempt_sequence_fallback(self):
        from app.services.llm_service import LLMService
        service = LLMService()
        attempts = service._llm_attempt_sequence("gemini-3.5-flash")
        # Ensure attempts is built as a non-empty list of (provider, model_id, api_key)
        self.assertIsInstance(attempts, list)
        if attempts:
            provider, model_id, api_key = attempts[0]
            self.assertIsNotNone(provider)
            self.assertIsNotNone(model_id)
            self.assertIsNotNone(api_key)

        # Test custom error message builder
        err = service._build_failover_error(["gemini/gemini-3.5-flash[...1234]"])
        self.assertIn("AI Generation Failed", str(err))
        self.assertIn("Please check your API keys or rate limit quota", str(err))

if __name__ == "__main__":
    unittest.main()
