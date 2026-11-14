"""
UsageOS demo-data seeder
========================
Fills a LOCAL UsageOS database with fictional accounts so you can take clean
screenshots (or just try the UI) without exposing any real account.

  *** Never run this against your real/production database. ***
  Everything it creates is tagged (org_id starts with "demo-org-") so
  `--reset` removes only the demo rows, but use a throwaway local stack anyway.

Run it inside the backend container (no rebuild needed):

    docker compose exec -T backend python - < scripts/seed_demo.py
    docker compose exec -T backend python - --reset < scripts/seed_demo.py   # remove demo data
    docker compose exec -T backend python - --fresh < scripts/seed_demo.py   # reset, then seed again

Or from a local backend checkout (DATABASE_URL must be set):

    cd backend && python ../scripts/seed_demo.py
"""
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")  # make `app` importable when run from backend/ or /app

from sqlalchemy import text  # noqa: E402

from app.database import Base, SyncSessionLocal, sync_engine  # noqa: E402
from app.models import Account, AccountNote, NotificationLog, Setting, SyncEvent  # noqa: E402

DEMO_PREFIX = "demo-org-"
STEP_MIN = 20                      # one history point every 20 minutes
SESSION = timedelta(hours=5)
WEEK = timedelta(days=7)

# pct_* are the values the dashboard shows RIGHT NOW. *_in = how far into the window we are.
DEMO_ACCOUNTS = [
    dict(slug="studio", email="maya@northwind.example", nickname="Studio", color="#5F7BAA",
         tier="claude_max_20x", session=42, session_in=2.1, weekly=61, weekly_in=3.4, sonnet=48, opus=22,
         note="Main account. Client work only.\nRenewal on the 14th."),
    dict(slug="research", email="maya.research@example.com", nickname="Research", color="#5B8A6B",
         tier="claude_max_5x", session=88, session_in=3.9, weekly=74, weekly_in=4.6, sonnet=70, opus=None,
         note="Long literature reviews. Keep Fridays free for synthesis."),
    dict(slug="side", email="maya.builds@example.com", nickname="Side Projects", color="#C49A2A",
         tier="claude_pro", session=17, session_in=0.8, weekly=29, weekly_in=2.2, sonnet=None, opus=None,
         note="Hack nights and weekend experiments."),
    dict(slug="writing", email="maya.writes@example.com", nickname="Writing", color="#C4593A",
         tier="claude_pro", session=100, session_in=4.4, weekly=93, weekly_in=5.9, sonnet=None, opus=None,
         note="Capped for now. Resume the draft after the reset."),
    dict(slug="team", email="maya@bluefern.example", nickname="Team Seat", color="#8B5A8C",
         tier="claude_team", session=9, session_in=0.4, weekly=12, weekly_in=1.1, sonnet=None, opus=None,
         note=""),
]

MAINTENANCE_NOTE = (
    "Demo data. Every account here is fictional.\n"
    "Tip: drag the corner of this note to resize it."
)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def history_points(spec, now, rng):
    """Yield (timestamp, limits dict) from 7 days ago up to now, ending exactly on today's values."""
    session_start_now = now - timedelta(hours=spec["session_in"])
    weekly_start_now = now - timedelta(days=spec["weekly_in"])
    start = now - timedelta(days=7)

    # A peak per past session window so the history chart has variety.
    peaks = {}

    def session_peak(idx):
        if idx not in peaks:
            peaks[idx] = rng.choice([8, 14, 22, 35, 48, 60, 74, 91, 100]) * rng.uniform(0.85, 1.0)
        return peaks[idx]

    t = start
    while t <= now:
        # Session window containing t (windows are 5h, aligned to today's session start).
        k = int((t - session_start_now).total_seconds() // SESSION.total_seconds())
        w_start = session_start_now + k * SESSION
        frac = max(0.0, (t - w_start) / SESSION)
        if k == 0:
            cur_frac = spec["session_in"] / 5
            s_pct = spec["session"] * (frac / cur_frac) ** 0.85 if cur_frac else 0
        else:
            s_pct = session_peak(k) * frac ** 0.8
        s_reset = w_start + SESSION

        # Weekly window containing t.
        wk = 0 if t >= weekly_start_now else -1
        if wk == 0:
            span = (now - weekly_start_now).total_seconds()
            w_frac = (t - weekly_start_now).total_seconds() / span if span else 0
            w_pct = spec["weekly"] * w_frac ** 1.1
            w_reset = weekly_start_now + WEEK
        else:
            prev_start = weekly_start_now - WEEK
            w_frac = max(0.0, (t - prev_start) / WEEK)
            w_pct = min(100, rng.uniform(55, 85) * w_frac ** 1.1)
            w_reset = weekly_start_now

        limits = {
            "session": {"usage_pct": round(min(100, s_pct), 1), "resets_at": iso(s_reset)},
            "weekly": {"usage_pct": round(min(100, w_pct), 1), "resets_at": iso(w_reset)},
            "sonnet_weekly": None,
            "opus_weekly": None,
        }
        if spec["sonnet"] is not None:
            limits["sonnet_weekly"] = {"usage_pct": round(min(100, w_pct * spec["sonnet"] / max(spec["weekly"], 1)), 1),
                                       "resets_at": iso(w_reset)}
        if spec["opus"] is not None:
            limits["opus_weekly"] = {"usage_pct": round(min(100, w_pct * spec["opus"] / max(spec["weekly"], 1)), 1),
                                     "resets_at": iso(w_reset)}
        yield t, limits
        t += timedelta(minutes=STEP_MIN)

    # Final point is exactly "now" with the exact target numbers.
    final = {
        "session": {"usage_pct": float(spec["session"]), "resets_at": iso(session_start_now + SESSION)},
        "weekly": {"usage_pct": float(spec["weekly"]), "resets_at": iso(weekly_start_now + WEEK)},
        "sonnet_weekly": ({"usage_pct": float(spec["sonnet"]), "resets_at": iso(weekly_start_now + WEEK)}
                          if spec["sonnet"] is not None else None),
        "opus_weekly": ({"usage_pct": float(spec["opus"]), "resets_at": iso(weekly_start_now + WEEK)}
                        if spec["opus"] is not None else None),
    }
    yield now, final


def reset(db):
    ids = [a.id for a in db.query(Account).filter(Account.org_id.like(f"{DEMO_PREFIX}%")).all()]
    if ids:
        db.query(NotificationLog).filter(NotificationLog.account_id.in_(ids)).delete(synchronize_session=False)
        db.query(SyncEvent).filter(SyncEvent.account_id.in_(ids)).delete(synchronize_session=False)
        db.query(AccountNote).filter(AccountNote.account_id.in_(ids)).delete(synchronize_session=False)
        db.query(Account).filter(Account.id.in_(ids)).delete(synchronize_session=False)
    db.execute(text("DELETE FROM settings WHERE key = 'maintenance_note' AND value = :v"), {"v": MAINTENANCE_NOTE})
    db.commit()
    print(f"Removed {len(ids)} demo account(s).")


def seed(db):
    rng = random.Random(42)  # deterministic: same screenshots every run
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    n_events = n_alerts = 0

    for i, spec in enumerate(DEMO_ACCOUNTS):
        org_id = f"{DEMO_PREFIX}{spec['slug']}"
        if db.query(Account).filter(Account.org_id == org_id).first():
            print(f"  skip {spec['slug']} (already exists; use --fresh to rebuild)")
            continue

        acct = Account(provider="claude", email=spec["email"], org_id=org_id, nickname=spec["nickname"],
                       color=spec["color"], subscription_tier=spec["tier"])
        db.add(acct)
        db.flush()
        db.add(AccountNote(account_id=acct.id, content=spec["note"]))

        acct_rng = random.Random(100 + i)
        for ts, limits in history_points(spec, now, acct_rng):
            db.add(SyncEvent(account_id=acct.id, email=spec["email"], org_id=org_id,
                             subscription_tier=spec["tier"], limits=limits, timestamp=ts))
            n_events += 1

        # A few past reset alerts so the Alerts page has content.
        for h in (6, 19, 31, 55, 80):
            reset_at = (now - timedelta(hours=h)).replace(minute=0, second=0, microsecond=0)
            kind_limit = "session" if h % 2 else "weekly"
            for kind, mins in (("pre_reset", 10), ("reset", 1)):
                if kind == "reset" and acct_rng.random() < 0.4:
                    continue
                db.add(NotificationLog(account_id=acct.id, limit_type=kind_limit, resets_at=reset_at,
                                       notification_type=kind, notified_at=reset_at - timedelta(minutes=mins)))
                n_alerts += 1

    existing = db.query(Setting).filter(Setting.key == "maintenance_note").first()
    if existing:
        existing.value = MAINTENANCE_NOTE
    else:
        db.add(Setting(key="maintenance_note", value=MAINTENANCE_NOTE))
    db.commit()
    print(f"Seeded {len(DEMO_ACCOUNTS)} demo accounts, {n_events} sync events, {n_alerts} alerts.")


def main():
    Base.metadata.create_all(bind=sync_engine)
    args = set(sys.argv[1:])
    db = SyncSessionLocal()
    try:
        if "--reset" in args or "--fresh" in args:
            reset(db)
            if "--reset" in args:
                return
        seed(db)
    finally:
        db.close()


main()
