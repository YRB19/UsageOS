from fastapi import HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from app.config import settings

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)

async def verify_api_key(authorization: str = Security(api_key_header)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization format")
    token = authorization.split(" ")[1]
    if token != settings.atlas_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return token