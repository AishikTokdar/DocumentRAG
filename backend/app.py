"""
DocumentRAG App Entrypoint (Hugging Face Spaces & ASGI compatibility)
"""

import os
import time
import uvicorn
from app.main import app as fastapi_app

# Export app at module level for Hugging Face / ASGI servers
app = fastapi_app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    try:
        uvicorn.run(fastapi_app, host="0.0.0.0", port=port)
    except OSError as e:
        if "already in use" in str(e) or "98" in str(e):
            time.sleep(2)
            uvicorn.run(fastapi_app, host="0.0.0.0", port=port)
        else:
            raise e
