"""FastAPI app entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import bills, health, lookups, sessions, sync

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(
    title="Buildertrend Service",
    description="Internal proxy for Buildertrend API. Not for public consumption.",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

from app.session_store import init_from_db  # noqa: E402


@app.on_event("startup")
async def _load_persisted_session() -> None:
    await init_from_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # Service-to-service only; no browser CORS needed.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(bills.router)
app.include_router(lookups.router)
app.include_router(sync.router)


@app.get("/")
async def root():
    return {"service": "bt-service", "version": "0.1.0"}
