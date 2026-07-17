from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.database import get_sync_db
from app.auth import verify_api_key
from app.config import settings

router = APIRouter(prefix="/api/v1/maintenance", tags=["maintenance"])

class MaintenanceNoteOut(BaseModel):
    content: str
    updated_at: datetime | None = None
    model_config = {"from_attributes": True}

class MaintenanceNoteIn(BaseModel):
    content: str

MAINTENANCE_NOTE_KEY = "maintenance_note"

@router.get("/note", response_model=MaintenanceNoteOut)
async def get_maintenance_note(db: Session = Depends(get_sync_db)):
    note = db.execute(
        "SELECT value, updated_at FROM settings WHERE key = :key",
        {"key": MAINTENANCE_NOTE_KEY}
    ).first()
    if note:
        return {"content": note[0], "updated_at": note[1]}
    return {"content": "", "updated_at": None}

@router.put("/note", response_model=MaintenanceNoteOut, dependencies=[Depends(verify_api_key)])
async def put_maintenance_note(body: MaintenanceNoteIn, db: Session = Depends(get_sync_db)):
    now = datetime.utcnow()
    result = db.execute(
        """
        INSERT INTO settings (key, value, updated_at) VALUES (:key, :value, :updated_at)
        ON CONFLICT (key) DO UPDATE SET value = :value, updated_at = :updated_at
        RETURNING value, updated_at
        """,
        {"key": MAINTENANCE_NOTE_KEY, "value": body.content, "updated_at": now}
    ).first()
    db.commit()
    if result:
        return {"content": result[0], "updated_at": result[1]}
    raise HTTPException(status_code=500, detail="Failed to save maintenance note")