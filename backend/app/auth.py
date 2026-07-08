from fastapi import Security, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import settings

bearer_scheme = HTTPBearer(auto_error=False)

async def require_api_key(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme)
) -> str:
    if not credentials or credentials.credentials != settings.ATLAS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials
