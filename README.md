# DocumentRAG

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Vite](https://img.shields.io/badge/Vite-5.4+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.3+-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4+-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue?logo=docker&logoColor=white)](https://www.docker.com/)

DocumentRAG is a state-of-the-art, open-source Retrieval-Augmented Generation (RAG) platform designed for multi-document indexing, intelligent synthesis, and context-aware chat interaction. It combines local CPU embeddings, FAISS vector search, a 7-stage agent pipeline, and real-time Server-Sent Events (SSE) streaming with multi-provider AI model failover.

- **GitHub Repository:** [https://github.com/AishikTokdar/DocumentRAG](https://github.com/AishikTokdar/DocumentRAG)

---

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [System Architecture & Data Flow](#system-architecture--data-flow)
- [Component Breakdown & Context](#component-breakdown--context)
- [Docker & Docker Compose Deployment](#docker--docker-compose-deployment)
- [Local Bash Deployment Guide](#local-bash-deployment-guide)
- [Remote Platform Deployment Guide](#remote-platform-deployment-guide)
- [Free AI API Keys Guide](#free-ai-api-keys-guide)
- [Environment Configuration (.env)](#environment-configuration-env)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Core Capabilities

- **Multi-Document Ingestion**: Upload up to 3 PDF documents simultaneously with a combined size limit of 50 MB.
- **Dual Knowledge Modes**:
  - **Hybrid Brain Mode**: Combines retrieved PDF citations with the AI's internal pretrained world knowledge for synthesized reasoning.
  - **Strict to Source Mode**: Enforces strict adherence to PDF context only, stating when information is absent.
- **Local Zero-Key Embeddings**: Uses HuggingFace `sentence-transformers/all-MiniLM-L6-v2` running on CPU for vector embeddings, requiring zero external embedding API keys.
- **7-Stage Multi-Agent Pipeline**: Executes Extractor, Analyzer, Preprocessor, Optimizer, Synthesizer, Validator, and Assembler stages for maximum answer grounding and reliability.
- **Multi-Provider Failover**: Automatically switches between Google Gemini, Groq, Cerebras, SambaNova, Hugging Face, and OpenRouter if a key or model hits rate limits.
- **SSE Token Streaming**: Real-time token-by-token streaming responses over Server-Sent Events.
- **Formatted Chat Exports**: One-click exports of full conversation history to clean `.txt` files or print-formatted `.pdf` documents.
- **Anonymous Session Isolation**: Browser-side Web Crypto UUID isolation ensures per-tab vector store privacy without mandatory user logins.

---

## System Architecture & Data Flow

```text
+-----------------------------------------------------------------------------------------------+
|                                    DOCUMENTRAG SYSTEM ARCHITECTURE                            |
+-----------------------------------------------------------------------------------------------+

  [ CLIENT LAYER ] - Browser SPA
  +---------------------------------------------------------------------------------------------+
  |  React 18 SPA (Vite + Tailwind CSS + Framer Motion)                                         |
  |  ├── Anonymous Session Generator (Web Crypto UUID v4 -> X-Chat-Session-Id header)           |
  |  ├── Interactive Chat Stream & Markdown Formatting Engine (Inline Citation Pills)            |
  |  ├── Knowledge Source Mode Switch (Hybrid Brain vs. Strict to Source)                       |
  |  └── Client Storage & Exporters (IndexedDB Chat History, Text .txt & PDF .pdf Exports)       |
  +---------------------------------------------------------------------------------------------+
                                                |
                      HTTP API Requests & SSE Real-time Token Stream
                                                |
                                                v
  [ INGESTION & VECTOR LAYER ] - Backend Pipeline
  +---------------------------------------------------------------------------------------------+
  |  1. PDF Ingestion & Document Processing                                                     |
  |     └── Upload Multi-PDF (up to 3 files, cumulative <= 50 MB)                               |
  |     └── PyPDF Loader -> Text Extraction -> RecursiveCharacterTextSplitter                   |
  |                                                                                             |
  |  2. Local Zero-Key Vector Engine                                                            |
  |     └── HuggingFace sentence-transformers/all-MiniLM-L6-v2 (Runs 100% locally on CPU)        |
  |     └── FAISS Dense Vector Store (Isolated per X-Chat-Session-Id in faiss_index/sessions/)  |
  +---------------------------------------------------------------------------------------------+
                                                |
                                      Context Vector Retrieval
                                                |
                                                v
  [ REASONING & PIPELINE LAYER ] - 7-Stage Agent Engine
  +---------------------------------------------------------------------------------------------+
  |  3. Multi-Agent RAG Orchestration                                                           |
  |     ├── [Stage 1: Extractor]   -> Top-k similarity retrieval from session FAISS index         |
  |     ├── [Stage 2: Analyzer]    -> Document context relevance filtering & deduplication      |
  |     ├── [Stage 3: Preprocess]  -> Text cleaning & prompt normalization                       |
  |     ├── [Stage 4: Optimizer]   -> Token window trimming & document chunk context packing     |
  |     ├── [Stage 5: Synthesizer] -> Mode-based prompt construction (Hybrid vs. Strict)        |
  |     ├── [Stage 6: Validator]   -> Fact grounding & safety validation                        |
  |     └── [Stage 7: Assembler]   -> Format answer text, metadata & citation pills             |
  +---------------------------------------------------------------------------------------------+
                                                |
                                 Multi-Provider Model API Calls
                                                |
                                                v
  [ AI PROVIDER FAILOVER LAYER ] - 6 Free AI Platforms / 22+ Models
  +---------------------------------------------------------------------------------------------+
  |  4. Failover Order: Google Gemini -> Groq LPU -> Cerebras -> SambaNova -> HF -> OpenRouter  |
  |     ├── Google Gemini: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash                  |
  |     ├── Groq LPU: llama-3.3-70b-versatile, llama-3.1-8b-instant, deepseek-r1-distill-70b   |
  |     ├── Cerebras WSE: llama3.3-70b, llama3.1-8b (2000+ tokens/sec)                          |
  |     ├── SambaNova Cloud: Meta-Llama-3.3-70B-Instruct, DeepSeek-R1-Distill-Llama-70B        |
  |     ├── Hugging Face: Qwen2.5-Coder-32B-Instruct, Mistral-7B-Instruct                      |
  |     └── OpenRouter: llama-3.3-70b-instruct:free, deepseek-r1:free, qwen-2.5-72b:free       |
  +---------------------------------------------------------------------------------------------+
```

---

## Component Breakdown & Context

### 1. React 18 Single Page Application (Frontend)
- **Context in Project**: Provides the modern interactive user interface. It manages real-time streaming displays, file dropzones, multi-document badges, theme toggling, and export options.
- **Key Responsibilities**: Renders Markdown bolding/lists, formats inline document citation pills (`[Doc - Page X]`), and maintains client-side chat state in IndexedDB.

### 2. Anonymous Session Isolation (`X-Chat-Session-Id`)
- **Context in Project**: Allows instant, privacy-respecting multi-tenant document indexing without requiring user registration or account databases.
- **Key Responsibilities**: A unique UUID v4 is generated in the browser using Web Crypto API and attached to every API request header. The backend uses this ID to scope FAISS vector stores in `faiss_index/sessions/<uuid>/`.

### 3. Local CPU Embedding Service (`sentence-transformers`)
- **Context in Project**: Converts extracted text chunks into 384-dimensional dense vector representations.
- **Key Responsibilities**: Operates locally on CPU using `sentence-transformers/all-MiniLM-L6-v2`. This eliminates third-party embedding API costs, eliminates embedding quota errors, and allows full zero-key document ingestion.

### 4. FAISS Vector Store Engine
- **Context in Project**: Acts as the fast vector search index for similarity retrieval.
- **Key Responsibilities**: Stores vector embeddings and chunk metadata. When a user asks a question, FAISS computes L2 distance / cosine similarity to return the top-k most relevant document excerpts.

### 5. 7-Stage Multi-Agent Pipeline
- **Context in Project**: Ensures answers are strictly grounded, high-quality, and free of hallucination.
- **Key Responsibilities**:
  1. **Extractor**: Retrieves top-k raw chunks from FAISS.
  2. **Analyzer**: Filters duplicate or low-similarity text chunks.
  3. **Preprocessor**: Cleans formatting anomalies and standardizes text.
  4. **Optimizer**: Trims context to fit the selected LLM's token context window.
  5. **Synthesizer**: Constructs the grounded RAG prompt based on selected Knowledge Mode.
  6. **Validator**: Checks generated output for safety and factual grounding.
  7. **Assembler**: Packages the final response with model metadata and citation pills.

### 6. Dual Knowledge Modes (`Hybrid Brain` vs `Strict to Source`)
- **Context in Project**: Gives users precise control over how AI model knowledge is synthesized.
- **Key Responsibilities**:
  - **Hybrid Brain Mode**: Instructs the LLM to combine PDF citations with its pretrained world knowledge for in-depth explanation (NotebookLM style).
  - **Strict to Source Mode**: Restricts the LLM to only answer using text explicitly present in the PDF documents.

### 7. Multi-Provider LLM Failover Manager
- **Context in Project**: Guarantees maximum uptime and reliability across free-tier AI model APIs.
- **Key Responsibilities**: If a provider returns a rate limit (HTTP 429) or error, the backend seamlessly switches to the next available provider in order (Gemini -> Groq -> Cerebras -> SambaNova -> Hugging Face -> OpenRouter) without failing the user request.

---

## Docker & Docker Compose Deployment

DocumentRAG includes full Docker and Docker Compose support for single-command production deployment.

### 1. Prerequisites
- Docker Engine 20.10+
- Docker Compose v2+

### 2. Configure Environment
Create a `.env` file in `backend/.env`:

```bash
cd backend
cp .env.example .env
# Edit .env and insert your API keys (e.g. GOOGLE_API_KEY, GROQ_API_KEY)
```

### 3. Launch Application
From the repository root, run:

```bash
docker compose up --build
```

### 4. Access Services
- **Frontend SPA**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000`
- **API Documentation**: `http://localhost:8000/docs`

To stop the containers, run:
```bash
docker compose down
```

---

## Local Bash Deployment Guide

### Prerequisites
- Python 3.11 or 3.12
- Node.js 18+ and npm 9+
- Git

### 1. Clone Repository
```bash
git clone https://github.com/AishikTokdar/DocumentRAG.git
cd DocumentRAG
```

### 2. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
# On Linux/macOS:
source .venv/bin/activate
# On Windows Bash:
source .venv/Scripts/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Run backend development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The FastAPI backend will run at `http://127.0.0.1:8000`.

### 3. Frontend Setup (New Terminal)
```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Configure environment variables
cp .env.example .env

# Launch Vite development server
npm run dev
```
The React SPA frontend will run at `http://localhost:5173`.

---

## Remote Platform Deployment Guide

### Option 1: Frontend on Vercel + Backend on Render

#### Deploy Backend to Render
1. Push your repository to GitHub.
2. Log in to [Render](https://render.com/).
3. Click **New +** -> **Web Service**.
4. Select the `backend` subfolder as the Root Directory.
5. Set Build & Runtime settings:
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add Environment Variables (`GOOGLE_API_KEY`, `GROQ_API_KEY`, etc.).
7. Set `CORS_ORIGINS=https://your-app.vercel.app`.

#### Deploy Frontend to Vercel
1. Log in to [Vercel](https://vercel.com/).
2. Import your GitHub repository and select `frontend` as Root Directory.
3. Framework Preset: **Vite**.
4. Build Command: `npm run build`.
5. Environment Variable:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://your-backend.onrender.com`

---

### Option 2: Hugging Face Spaces (Free Docker Deployment)

1. Create a new Space on [Hugging Face Spaces](https://huggingface.co/new-space).
2. Select **Docker** as the Space SDK.
3. In your Space repository, create a `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl nodejs npm && rm -rf /var/lib/apt/lists/*

COPY backend /app/backend
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY frontend /app/frontend
WORKDIR /app/frontend
RUN npm install && npm run build

WORKDIR /app/backend
EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

4. Add your API key secrets in Space Settings.

---

## Free AI API Keys Guide

DocumentRAG supports 6 free-tier AI providers offering access to over 22 free models. At least one valid API key must be configured in your backend environment.

### 1. Google Gemini API Key (`GOOGLE_API_KEY`)
- **Cost**: Free tier available (Google AI Studio).
- **Supported Models**: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`.
- **How to Get**:
  1. Visit [Google AI Studio](https://aistudio.google.com/).
  2. Sign in with your Google account.
  3. Click **Get API Key** -> **Create API key in new project** and copy the key.

### 2. Groq LPU API Key (`GROQ_API_KEY`)
- **Cost**: Free tier with high speed LPU inference.
- **Supported Models**: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `deepseek-r1-distill-llama-70b`.
- **How to Get**:
  1. Visit [Groq Console](https://console.groq.com/).
  2. Navigate to **API Keys** -> **Create API Key** and copy the key.

### 3. Cerebras Wafer-Scale Engine Key (`CEREBRAS_API_KEY`)
- **Cost**: Free Developer Tier (2000+ tokens/sec).
- **Supported Models**: `llama3.3-70b`, `llama3.1-8b`.
- **How to Get**:
  1. Visit [Cerebras Cloud Console](https://cloud.cerebras.ai/).
  2. Go to **API Keys** -> **Create New Key** and copy the key.

### 4. SambaNova Cloud Key (`SAMBANOVA_API_KEY`)
- **Cost**: Free tier access to SN40L chips.
- **Supported Models**: `Meta-Llama-3.3-70B-Instruct`, `DeepSeek-R1-Distill-Llama-70B`, `Qwen2.5-72B-Instruct`.
- **How to Get**:
  1. Visit [SambaNova Cloud Portal](https://cloud.sambanova.ai/).
  2. Access **API Keys** and generate your key.

### 5. Hugging Face Access Token (`HF_API_KEY`)
- **Cost**: Free Serverless Inference API.
- **Supported Models**: `Qwen/Qwen2.5-Coder-32B-Instruct`, `mistralai/Mistral-7B-Instruct-v0.3`.
- **How to Get**:
  1. Visit [Hugging Face Settings Tokens](https://huggingface.co/settings/tokens).
  2. Click **Create new token** (Role: Read) and copy the token.

### 6. OpenRouter Free Key (`OPENROUTER_API_KEY`)
- **Cost**: Free tier models with 0 credit requirement.
- **Supported Models**: `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-r1:free`, `qwen/qwen-2.5-72b-instruct:free`.
- **How to Get**:
  1. Visit [OpenRouter Keys](https://openrouter.ai/keys).
  2. Click **Create Key** and copy your key.

---

## Environment Configuration (.env)

### Backend Environment Setup (`backend/.env`)

```env
# Server Settings
HOST=0.0.0.0
PORT=8000
ENVIRONMENT=production

# CORS Origins
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-frontend.vercel.app

# Free AI API Keys (Configure at least one)
GOOGLE_API_KEY=your_google_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
CEREBRAS_API_KEY=your_cerebras_api_key_here
SAMBANOVA_API_KEY=your_sambanova_api_key_here
HF_API_KEY=your_huggingface_token_here
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Default Model Selection
DEFAULT_MODEL=gemini-2.5-flash
DEFAULT_PROVIDER=gemini

# Vector Store & Session Limits
MAX_FILE_SIZE=52428800
FAISS_PERSIST_DIR=faiss_index
MAX_VECTOR_SESSIONS=64
FAISS_SESSION_MAX_AGE_DAYS=3

# IP Rate Limits
RATE_LIMIT_UPLOAD_PER_MINUTE=8
RATE_LIMIT_ASK_PER_MINUTE=90
```

### Frontend Environment Setup (`frontend/.env`)

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_APP_ENV=development
```

---

## API Reference & Interactive Documentation

DocumentRAG provides auto-generated interactive OpenAPI / Swagger UI documentation out of the box when running the backend.

### Interactive API Explorer Endpoints:
- **Swagger UI Sandbox**: [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs) (Test endpoints live in your browser)
- **ReDoc Technical View**: [`http://127.0.0.1:8000/redoc`](http://127.0.0.1:8000/redoc) (Clean structured REST API reference)
- **Raw OpenAPI Schema**: [`http://127.0.0.1:8000/openapi.json`](http://127.0.0.1:8000/openapi.json) (OpenAPI 3.1 specification)

### API Endpoints Overview:

All protected state endpoints accept an optional `X-Chat-Session-Id` header (UUID v4) for session isolation.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/docs` | Interactive Swagger UI API documentation & testing sandbox |
| `GET` | `/redoc` | ReDoc API specification documentation view |
| `GET` | `/openapi.json` | OpenAPI 3.1 JSON schema definition |
| `GET` | `/` | System health and API basic info |
| `GET` | `/health` | Live backend health status check |
| `GET` | `/models` | List supported AI models & credential availability |
| `GET` | `/status` | Session vector store loaded status |
| `POST` | `/upload` | Upload PDF files (up to 3 files, combined <= 50 MB) |
| `POST` | `/ask` | Submit question (Non-streaming JSON response) |
| `POST` | `/ask/stream` | Submit question (SSE real-time token streaming) |
| `GET` | `/runtime-summary` | Provider health metrics dashboard |

---

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Vanilla Tailwind CSS & Framer Motion
- **Icons**: Lucide React
- **Storage**: Browser IndexedDB & Web Storage

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Server**: Uvicorn ASGI
- **Vector Search**: FAISS CPU
- **Embeddings**: Hugging Face `sentence-transformers/all-MiniLM-L6-v2`
- **PDF Processing**: PyPDF & LangChain Text Splitters
- **Validation**: Pydantic v2

---

## License

This project is licensed under the [MIT License](LICENSE). Feel free to inspect, customize, and extend DocumentRAG for personal, educational, or commercial applications.
