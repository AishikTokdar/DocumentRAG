"""Gradio Space entrypoint. Upload the backend folder contents to the Space root."""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))
os.environ["GRADIO_SSR_MODE"] = "False"

try:
    import spaces
except ImportError:
    class _SpacesFallback:
        @staticmethod
        def GPU(function):
            return function
    spaces = _SpacesFallback()

import gradio as gr  # noqa: E402

from app.main import app as fastapi_app  # noqa: E402

@spaces.GPU
def backend_status(value: str = "") -> str:
    return "DocumentRAG backend is ready. API documentation: /docs"

demo = gr.Interface(
    fn=backend_status,
    inputs=gr.Textbox(label="Status", value=""),
    outputs=gr.Textbox(label="Backend status"),
    title="DocumentRAG Backend API",
    description="General document RAG. REST API: /docs and /redoc. Health: /health.",
)

app = gr.mount_gradio_app(fastapi_app, demo, path="/", ssr_mode=False)

if __name__ == "__main__":
    import uvicorn
    try:
        import spaces.zero as spaces_zero
        startup = getattr(spaces_zero, "startup", None)
        if callable(startup):
            startup()
            print("ZeroGPU startup registration complete.")
    except Exception as exc:
        print(f"ZeroGPU startup registration unavailable: {type(exc).__name__}")
    port = int(os.environ.get("PORT", os.environ.get("SERVER_PORT", 7860)))
    uvicorn.run(app, host="0.0.0.0", port=port, workers=1,
                proxy_headers=False, timeout_keep_alive=5, timeout_graceful_shutdown=40)
