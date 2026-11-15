# Deploy the DocumentRAG frontend

Use the same static frontend workflow as ResearchPaperRAG. The frontend calls the Gradio Space's FastAPI routes directly; no Cloudflare Function is needed.

For Cloudflare Pages Git integration, set root directory `frontend`, build command `npm run build`, output directory `dist`, and `NODE_VERSION=24`. Set `VITE_API_BASE_URL=https://YOUR-SPACE.hf.space` in production and preview build variables, then rebuild. Use the origin only, without `/api` or `/gradio`.

For drag-and-drop deployment, set that variable in `frontend/.env.local`, run `npm install` then `npm run build` inside `frontend`, and upload **`frontend/dist`** to Pages Direct Upload. Uploading raw React source does not build it; dashboard variables cannot change an already-built upload.

For Vercel with repository root selected, the root workspace runs `npm install` and `npm run build`, producing root `dist`. With `frontend` selected as root, use its local build and `dist`. Both configurations include SPA fallback for `/chat` and `/api-status`.

Set backend `CORS_ORIGINS` to the exact Pages/Vercel origin. Provider keys belong only in backend secrets. Production ignores development query-string API overrides.

Check `/chat`, direct navigation to `/api-status`, a small PDF upload, a cited answer, streaming, reset, history and exports from the real hosted frontend.
