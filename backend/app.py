"""
DocumentRAG backend entrypoint for Hugging Face Spaces.

Exports the FastAPI backend with `/docs` and `/redoc`, and mounts a minimal
Gradio shell at the root for Hugging Face Spaces compatibility.
"""

import os

# Keep Gradio in client-side mode when the UI is mounted inside FastAPI.
os.environ["GRADIO_SSR_MODE"] = "False"

import spaces

@spaces.GPU
def zerogpu_probe(value: str) -> str:
    """Gradio inference callback required by the ZeroGPU Space runtime."""
    return value or "DocumentRAG backend is ready."


import gradio as gr

from app.main import app as fastapi_app


# Keep the Space on the Gradio SDK while exposing only the backend API. Using
# Interface makes the @spaces.GPU callback visible to ZeroGPU's validator.
demo = gr.Interface(
    fn=zerogpu_probe,
    inputs=gr.Textbox(label="Status", value=""),
    outputs=gr.Textbox(label="Backend status"),
    title="DocumentRAG Backend API",
    description="The REST API is available at /docs and /redoc.",
)


# Export the FastAPI backend as the Space app. Exact API routes remain available
# while Gradio is mounted at the root for the Gradio Space runtime.
app = gr.mount_gradio_app(fastapi_app, demo, path="/", ssr_mode=False)


if __name__ == "__main__":
    import uvicorn

    # mount_gradio_app does not invoke Gradio's normal launch hook. Register
    # the decorated callback explicitly so the ZeroGPU scheduler detects it.
    try:
        import spaces.zero as _spaces_zero

        _zero_startup = getattr(_spaces_zero, "startup", None)
        if callable(_zero_startup):
            _zero_startup()
            print("ZeroGPU startup registration complete.")
        else:
            print("ZeroGPU startup hook unavailable; continuing with Gradio mount.")
    except Exception as exc:
        print(f"ZeroGPU startup registration failed: {exc}")

    port = int(os.environ.get("PORT", os.environ.get("SERVER_PORT", 7860)))
    uvicorn.run(app, host="0.0.0.0", port=port)
