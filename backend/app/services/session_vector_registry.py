"""
Per-browser anonymous session vector stores (LRU-bounded).

Each X-Chat-Session-Id (UUID) gets its own FAISS persist directory so concurrent
demo users do not overwrite each other's indexes. Oldest sessions are evicted
when max_sessions is exceeded.

VPS / scaling: disk paths are shared across processes. For correct writes, prefer
a single API worker per instance (or sticky sessions to the same worker), or
you can get concurrent upload races to the same session folder from different workers.
"""

from __future__ import annotations

import logging
import re
import threading
from collections import OrderedDict

from .vector_store import VectorStoreService

logger = logging.getLogger(__name__)

_SESSION_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

def is_valid_session_id(session_id: str) -> bool:
    return bool(_SESSION_ID_RE.match(session_id.strip()))

class SessionVectorRegistry:
    def __init__(self, max_sessions: int) -> None:
        self._max = max(4, min(int(max_sessions), 10_000))
        self._stores: OrderedDict[str, VectorStoreService] = OrderedDict()
        self._lock = threading.Lock()
        self._retired_ids: OrderedDict[str, bool] = OrderedDict()
        self._pending: dict[str, VectorStoreService] = {}

    def get_or_create(self, session_id: str) -> VectorStoreService:
        sid = session_id.strip()
        if not is_valid_session_id(sid):
            raise ValueError("Invalid session id")

        with self._lock:
            if sid in self._retired_ids:
                from fastapi import HTTPException
                raise HTTPException(409, "Session has been reset. Start a new document session.")
            if sid in self._stores:
                self._stores.move_to_end(sid)
                self._stores[sid].touch_retention()
                return self._stores[sid]

            svc = VectorStoreService(session_id=sid)
            if svc.is_ready:
                svc.touch_retention()
                self._remember(svc)
            return svc

    def _remember(self, service: VectorStoreService) -> None:
        if service.session_id not in self._stores and len(self._stores) >= self._max:
            from fastapi import HTTPException
            for sid, victim in list(self._stores.items()):
                if victim.operation_lock.acquire(blocking=False):
                    try:
                        victim._retired = True
                        victim.discard_persisted_index_if_idle()
                        victim.clear()
                        self._stores.pop(sid)
                    finally:
                        victim.operation_lock.release()
                    break
            else:
                raise HTTPException(429, "All document sessions are busy. Try again shortly.")
        self._stores[service.session_id] = service
        self._stores.move_to_end(service.session_id)

    def activate(self, service: VectorStoreService) -> VectorStoreService:
        from fastapi import HTTPException
        with self._lock:
            if service._retired or service.session_id in self._retired_ids:
                raise HTTPException(409, "Session has been reset")
            existing = self._stores.get(service.session_id)
            if existing is not None:
                return existing
            self._remember(service)
            return service

    def replace_documents(self, service: VectorStoreService, documents) -> int:
        from fastapi import HTTPException
        if not service.operation_lock.acquire(blocking=False):
            raise HTTPException(409, "A document operation is already in progress")
        try:
            with self._lock:
                if service._retired or service.session_id in self._retired_ids or service.session_id in self._pending:
                    raise HTTPException(409, "Document session changed or is busy")
                self._pending[service.session_id] = service
            prepared = service.prepare_documents(documents)
            with self._lock:
                existing = self._stores.get(service.session_id)
                if service._retired or service.session_id in self._retired_ids or (existing is not None and existing is not service):
                    raise HTTPException(409, "Document session changed; please retry")
                victim = None
                if existing is None and len(self._stores) >= self._max:
                    for sid, candidate in self._stores.items():
                        if candidate.operation_lock.acquire(blocking=False):
                            victim = (sid, candidate)
                            break
                    if victim is None:
                        raise HTTPException(429, "All document sessions are busy. Try again shortly.")
                try:
                    service.publish_documents(prepared)
                    if victim:
                        sid, candidate = victim
                        candidate._retired = True
                        candidate.discard_persisted_index_if_idle()
                        candidate.clear()
                        self._stores.pop(sid)
                    self._stores[service.session_id] = service
                    self._stores.move_to_end(service.session_id)
                finally:
                    if victim:
                        victim[1].operation_lock.release()
            return len(documents)
        finally:
            with self._lock:
                if self._pending.get(service.session_id) is service:
                    self._pending.pop(service.session_id)
            service.operation_lock.release()

    def delete_session(self, session_id: str) -> bool:
        if not is_valid_session_id(session_id):
            return False
        import shutil
        from pathlib import Path

        from fastapi import HTTPException
        with self._lock:
            service = self._stores.get(session_id)
            if service and not service.operation_lock.acquire(blocking=False):
                raise HTTPException(409, "Document session is busy. Stop the operation and retry reset.")
            try:
                path = Path(VectorStoreService.disk_path_for_session(session_id))
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                pending = self._pending.get(session_id)
                if pending is not None:
                    pending._retired = True
                if service:
                    service._retired = True
                    service.clear()
                    self._stores.pop(session_id, None)
                self._retired_ids[session_id] = True
                while len(self._retired_ids) > 10000:
                    self._retired_ids.popitem(last=False)
                return True
            finally:
                if service:
                    service.operation_lock.release()
