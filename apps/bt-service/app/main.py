"""FastAPI app entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import bills, health, internal, lookups, sessions, sync
from app.session_store import init_from_db

logging.basicConfig(level=logging.INFO)

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await init_from_db()
    yield


app = FastAPI(
    title="Buildertrend Service",
    description="Private sidecar for Buildertrend API calls. Not a public API.",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

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
app.include_router(internal.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "bt-service", "version": "0.1.0"}
