---
title: DocumentRAG Backend
emoji: ⚡
colorFrom: purple
colorTo: indigo
sdk: gradio
sdk_version: 5.20.0
python_version: "3.12"
app_file: app.py
pinned: false
---

# DocumentRAG Hugging Face Backend API

This Hugging Face Space hosts the FastAPI backend for DocumentRAG only.
The frontend is deployed separately, for example on Vercel, and should call this Space over HTTP. The Hugging Face deployment serves the backend API at `/`, `/docs`, `/redoc`, and the REST endpoints below.

Key endpoints include:
- `/health`
- `/upload`
- `/ask`
- `/ask/stream`
- `/models`
- `/pipeline-info`
- `/runtime-summary`
