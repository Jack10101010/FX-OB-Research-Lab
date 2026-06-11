from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import tempfile
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging early so the optional-Mongo init below can log.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── MongoDB connection (OPTIONAL) ────────────────────────────────────────────
# The research app's durable projects/insights store is a local JSON file (see
# the /api/projects routes below) and needs no database. Mongo is only used by
# the legacy /api/status demo routes, so we connect lazily and never crash the
# server when MONGO_URL is absent.
client = None
db = None
mongo_url = os.environ.get('MONGO_URL')
if mongo_url:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(mongo_url)
        db = client[os.environ.get('DB_NAME', 'app')]
        logger.info("MongoDB connected (status routes enabled).")
    except Exception as exc:  # pragma: no cover - depends on local env
        logger.warning("MongoDB unavailable (%s); status routes disabled.", exc)
else:
    logger.info("No MONGO_URL set; running file-only (projects persistence active).")

# ── Local projects/insights persistence ──────────────────────────────────────
# A single JSON file holds the full projects map exactly as the frontend store
# serializes it (the same object that also goes to localStorage). This makes
# saved insights durable on disk: they survive browser-data clears, are easy to
# back up/version, and can be inspected directly.
DATA_DIR = Path(os.environ.get('FXOB_DATA_DIR', ROOT_DIR / 'data'))
PROJECTS_FILE = DATA_DIR / 'projects.json'


def _read_projects_file() -> Dict[str, Any]:
    try:
        if not PROJECTS_FILE.exists():
            return {}
        raw = PROJECTS_FILE.read_text(encoding='utf-8')
        data = json.loads(raw) if raw.strip() else {}
        # Accept either a bare map or a wrapped {"projects": {...}} document.
        if isinstance(data, dict) and 'projects' in data and isinstance(data['projects'], dict):
            return data['projects']
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning("Failed reading %s: %s", PROJECTS_FILE, exc)
        return {}


def _write_projects_file(projects: Dict[str, Any]) -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    updated_at = datetime.now(timezone.utc).isoformat()
    document = {"version": 1, "updatedAt": updated_at, "projects": projects}
    # Atomic write: serialize to a temp file in the same dir, then replace.
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), prefix='.projects-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(document, fh, ensure_ascii=False, indent=2)
        os.replace(tmp_path, PROJECTS_FILE)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass
    return updated_at


# ── Generic per-domain JSON storage (STORAGE Phase 1) ─────────────────────────
# The same durable-on-disk pattern as projects, generalized to a small allowlist
# of research domains. Each domain maps to backend/data/{domain}.json holding the
# payload the frontend localStorage cache also holds. The allowlist is the ONLY
# source of file names — the {domain} path param is never used to build a path
# until it has been checked against this set, so arbitrary paths can't be reached.
#
# localStorage stays the instant cache/fallback; these files are the durable
# local mirror (and the future SQLite migration will sit behind this same API).
STORAGE_DOMAINS = {
    "playbook",
    "entry_hypotheses",
    "entry_promotion",
    "section_roadmaps",
    "configs",
}


def _atomic_write_json(path: Path, document: Any, prefix: str) -> None:
    """Serialize `document` to `path` atomically (temp file in same dir + replace)."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), prefix=prefix, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(document, fh, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass


def _domain_file(domain: str) -> Path:
    # Caller MUST have validated `domain` against STORAGE_DOMAINS first.
    return DATA_DIR / f"{domain}.json"


def _read_domain(domain: str) -> Any:
    """Return the stored payload for a domain, or None if absent/unreadable."""
    path = _domain_file(domain)
    try:
        if not path.exists():
            return None
        raw = path.read_text(encoding='utf-8')
        if not raw.strip():
            return None
        data = json.loads(raw)
        # Wrapped {"version","updatedAt","payload"} document → return inner payload.
        if isinstance(data, dict) and 'payload' in data:
            return data['payload']
        return data
    except Exception as exc:
        logger.warning("Failed reading domain %s: %s", domain, exc)
        return None


def _write_domain(domain: str, payload: Any) -> str:
    updated_at = datetime.now(timezone.utc).isoformat()
    document = {"version": 1, "domain": domain, "updatedAt": updated_at, "payload": payload}
    _atomic_write_json(_domain_file(domain), document, prefix=f'.{domain}-')
    return updated_at


# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ── Models ────────────────────────────────────────────────────────────────────
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class ProjectsPayload(BaseModel):
    # The full projects map keyed by project id. Mirrors the frontend store's
    # `state.projects` object exactly.
    projects: Dict[str, Any] = Field(default_factory=dict)


class StoragePayload(BaseModel):
    # Arbitrary per-domain payload (object or array) mirroring the frontend's
    # localStorage value for that domain.
    payload: Any = None


# ── Routes ──────────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "Hello World", "projectsPersistence": True, "mongo": db is not None}


@api_router.get("/projects")
async def get_projects():
    """Return the durable projects/insights map from disk."""
    projects = _read_projects_file()
    return {"projects": projects, "count": len(projects)}


@api_router.put("/projects")
async def put_projects(payload: ProjectsPayload):
    """Replace the on-disk projects map with the supplied full map (atomic write)."""
    projects = payload.projects or {}
    if not isinstance(projects, dict):
        raise HTTPException(status_code=400, detail="`projects` must be an object map")
    updated_at = _write_projects_file(projects)
    return {"ok": True, "count": len(projects), "updatedAt": updated_at}


@api_router.get("/storage/{domain}")
async def get_storage_domain(domain: str):
    """Return the durable payload for an allowlisted research domain from disk."""
    if domain not in STORAGE_DOMAINS:
        raise HTTPException(status_code=404, detail=f"Unknown storage domain: {domain}")
    payload = _read_domain(domain)
    return {"domain": domain, "payload": payload, "exists": payload is not None}


@api_router.put("/storage/{domain}")
async def put_storage_domain(domain: str, body: StoragePayload):
    """Replace the on-disk payload for an allowlisted research domain (atomic write)."""
    if domain not in STORAGE_DOMAINS:
        raise HTTPException(status_code=404, detail=f"Unknown storage domain: {domain}")
    updated_at = _write_domain(domain, body.payload)
    return {"ok": True, "domain": domain, "updatedAt": updated_at}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured")
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if client is not None:
        client.close()
