---
title: DocumentRAG Backend
emoji: 📄
colorFrom: gray
colorTo: yellow
sdk: gradio
sdk_version: 6.31.0
python_version: "3.12"
app_file: app.py
pinned: false
---

# DocumentRAG backend

Upload the contents of this **entire backend folder** into the root of a Hugging Face **Gradio Space**, exactly as for ResearchPaperRAG. Keep `README.md`, `app.py`, `app/`, `gradio_app.py`, and the requirements files together at the Space root. Space installation automatically reads `requirements.txt`; no separate dependency installation is needed.

Set provider credentials in Space Secrets (`GOOGLE_API_KEY`, `GROQ_API_KEY`, or `OPENROUTER_API_KEY`). Set `CORS_ORIGINS` to your exact frontend origin, for example `https://YOUR-PROJECT.pages.dev`. The platform `SPACE_HOST` is accepted automatically. Never place credentials in frontend variables.

The entrypoint runs FastAPI with a mounted Gradio status interface and one Uvicorn worker on `PORT`, then `SERVER_PORT`, then `7860`. Check `/health`, `/docs`, `/openapi.json`, `/`, `/config`, and `/gradio_api/info`. The React document UI remains separately hosted.

CPU hardware is sufficient for the existing local HuggingFace embeddings. The entrypoint retains the sibling's optional ZeroGPU decorator and startup-registration compatibility hook; CPU embeddings remain unchanged. `python gradio_app.py` remains the separate compatibility PDF-chat interface.

Do not upload `.env`, virtual environments, caches, indexes, uploads, or documents. To generate a clean equivalent upload folder from the main repository, run `python scripts/prepare_huggingface.py --output dist/huggingface` and upload that folder's contents. Existing output folders are rejected.

For local API-only use: install `requirements-dev.txt`, then run `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers`. API-only containers install `requirements-api.txt`; the default backend upload profile includes Gradio and Spaces.

The Gradio profile currently constrains Pillow below 13 and has unresolved optional dependency advisories. The API-only profile is audited separately; passing an API-only audit does not certify this profile.

The Gradio SDK automatically installs MCP/OAuth extras. Gradio 6.31's MCP extra requires Pydantic `<=2.12.5`, so this upload profile uses that compatible range and Torch `<=2.13.0`. The lean API/Docker profile keeps Pydantic `>=2.14.2`. Install these profiles in separate environments; do not substitute `requirements-api.txt` for the Space's `requirements.txt`.

Length-limited answers continue automatically in bounded parts using the same model and evidence. Streaming displays the first part as it arrives, shows continuation progress, then appends subsequent parts. `MAX_ANSWER_PARTS` defaults to 6; the request deadline still applies. Limits and interruptions are disclosed, and incomplete output is not cached as a successful full answer.

Eligible session indexes may recover after restart if host storage persists. Startup prunes indexes older than configured `FAISS_SESSION_MAX_AGE_DAYS` (default 3). This is not a continuous deletion deadline or a durable-storage guarantee. Explicit session deletion remains available. Local transcripts restore only against a matching corpus fingerprint.
