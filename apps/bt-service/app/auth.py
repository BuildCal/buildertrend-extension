"""Service-to-service authentication.

The Next.js web app calls this service over HTTPS. Both share a secret
token (INTERNAL_API_TOKEN). We validate it on every request via a header.

This is intentionally simple. The service is not exposed publicly — it
sits behind your VM firewall / Fly private network — and the token is
just a "are you the web app?" check, not a fine-grained auth system.

User-level auth (which person did what) lives in the web app, not here.
"""

import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings


async def require_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    """FastAPI dependency. Use as: Depends(require_internal_token)."""
    expected = get_settings().internal_api_token
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal API token",
        )
