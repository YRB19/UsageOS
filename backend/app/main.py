from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import sync, accounts, notes, history, dashboard, notifications
from .services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (Alembic handles production migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Start background scheduler
    start_scheduler()
    yield
    # Stop background scheduler
    stop_scheduler()


app = FastAPI(
    title="ATLAS Claude API",
    description="Multi-account Claude usage tracker — part of the ATLAS infrastructure.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # tighten to your dashboard domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
app.include_router(accounts.router)
app.include_router(notes.router)
app.include_router(history.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
