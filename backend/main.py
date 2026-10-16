"""Compatibility launch path for the canonical, session-isolated API.

Prefer: python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
The former standalone/shared-document implementation is intentionally retired.
"""

from app.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
