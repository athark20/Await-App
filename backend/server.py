from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, uuid, logging, json, re, base64, tempfile
import bcrypt
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI()
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("await")

FREE_ACTIVE_LIMIT = 10
FREE_AI_EXTRACTIONS = 5
FREE_AI_FOLLOWUPS = 3
NEEDS_REVIEW_IGNORED = 3
NEEDS_REVIEW_SILENT_DAYS = 8

CATEGORIES = ["DELIVERY", "REFUND", "DOCUMENT", "APPOINTMENT", "PAYMENT", "OTHER"]
STATES = ["MY_TURN", "THEIR_TURN", "DONE"]
SOURCE_TYPES = ["MANUAL", "SHARED_TEXT", "SCREENSHOT", "IMAGE", "DOCUMENT", "VOICE", "URL"]


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat() if dt else None


def parse_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def uid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def clean(doc: dict):
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = iso(v if v.tzinfo else v.replace(tzinfo=timezone.utc))
    return doc


# ----------------------------------------------------------------------------- Auth
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class SessionIn(BaseModel):
    session_id: str


class ForgotIn(BaseModel):
    email: str


async def mint_session(user_id: str):
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "created_at": now(), "expires_at": now() + timedelta(days=7),
    })
    return token


def public_user(u: dict):
    return {
        "user_id": u["user_id"], "email": u["email"], "name": u.get("name", ""),
        "picture": u.get("picture"), "plan": u.get("plan", "FREE"),
        "ai_extractions_used": u.get("ai_extractions_used", 0),
        "ai_followups_used": u.get("ai_followups_used", 0),
        "created_at": iso(parse_dt(u.get("created_at"))),
    }


async def create_user(email: str, name: str, picture=None, password_hash=None):
    user = {
        "user_id": uid("user"), "email": email.lower(), "name": name or email.split("@")[0],
        "picture": picture, "password_hash": password_hash, "plan": "FREE",
        "ai_extractions_used": 0, "ai_followups_used": 0, "usage_month": now().strftime("%Y-%m"),
        "created_at": now(),
    }
    await db.users.insert_one(user)
    await seed_user(user["user_id"])
    return user


async def get_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = auth[7:]
    s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not s or parse_dt(s["expires_at"]) < now():
        raise HTTPException(401, "Session expired")
    u = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User not found")
    month = now().strftime("%Y-%m")
    if u.get("usage_month") != month:
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"usage_month": month, "ai_extractions_used": 0, "ai_followups_used": 0}})
        u["ai_extractions_used"] = 0
        u["ai_followups_used"] = 0
    return u


@api.post("/auth/register")
async def register(body: RegisterIn):
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "An account with this email already exists")
    ph = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    u = await create_user(body.email, body.name, password_hash=ph)
    return {"session_token": await mint_session(u["user_id"]), "user": public_user(u)}


@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not u or not u.get("password_hash") or not bcrypt.checkpw(body.password.encode(), u["password_hash"].encode()):
        raise HTTPException(401, "Incorrect email or password")
    return {"session_token": await mint_session(u["user_id"]), "user": public_user(u)}


@api.post("/auth/session")
async def google_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session")
    d = r.json()
    u = await db.users.find_one({"email": d["email"].lower()}, {"_id": 0})
    if not u:
        u = await create_user(d["email"], d.get("name", ""), d.get("picture"))
    elif d.get("picture") and not u.get("picture"):
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"picture": d["picture"]}})
    token = d.get("session_token") or uuid.uuid4().hex
    await db.user_sessions.insert_one({"session_token": token, "user_id": u["user_id"], "created_at": now(), "expires_at": now() + timedelta(days=7)})
    return {"session_token": token, "user": public_user(u)}


@api.post("/auth/forgot")
async def forgot(body: ForgotIn):
    return {"ok": True, "message": "If an account exists, a reset link has been sent."}


@api.get("/auth/me")
async def me(user=Depends(get_user)):
    return public_user(user)


@api.post("/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth[7:]})
    return {"ok": True}


@api.post("/auth/guest")
async def guest():
    u = await create_user(f"guest_{uuid.uuid4().hex[:8]}@await.local", "Guest")
    return {"session_token": await mint_session(u["user_id"]), "user": public_user(u)}


@api.delete("/auth/account")
async def delete_account(user=Depends(get_user)):
    await db.awaits.update_many({"user_id": user["user_id"]}, {"$set": {"deleted_at": now()}})
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


# ----------------------------------------------------------------------------- Awaits
class AwaitIn(BaseModel):
    title: Optional[str] = None
    ownerName: str
    commitment: str
    expectedAt: Optional[str] = None
    expectedText: Optional[str] = None
    expectedDateOnly: bool = True
    state: str = "THEIR_TURN"
    category: str = "OTHER"
    notes: Optional[str] = ""
    sourceType: str = "MANUAL"
    sourceAppLabel: Optional[str] = None
    evidence: Optional[List[Dict[str, Any]]] = None


class AwaitPatch(BaseModel):
    ownerName: Optional[str] = None
    commitment: Optional[str] = None
    expectedAt: Optional[str] = None
    expectedText: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class StateIn(BaseModel):
    state: str


class SnoozeIn(BaseModel):
    days: Optional[int] = None
    until: Optional[str] = None


class EvidenceIn(BaseModel):
    type: str
    contentText: Optional[str] = None
    uri: Optional[str] = None
    mimeType: Optional[str] = None
    fileName: Optional[str] = None


class ResolutionIn(BaseModel):
    action: str  # close | still_waiting | remind_later
    days: Optional[int] = 1
    evidence: Optional[Dict[str, Any]] = None


class UpdateApplyIn(BaseModel):
    expectedAt: Optional[str] = None
    expectedText: Optional[str] = None
    note: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None


class FollowupSentIn(BaseModel):
    checkDays: int = 3
    text: Optional[str] = None


class ReopenIn(BaseModel):
    state: str = "THEIR_TURN"


def compute_attention(a: dict):
    if a.get("state") == "DONE":
        return "NORMAL"
    if a.get("attentionState") in ("POSSIBLE_RESOLUTION", "NEEDS_REVIEW"):
        return a["attentionState"]
    exp = parse_dt(a.get("expectedAt"))
    if a.get("ignoredReminderCount", 0) >= NEEDS_REVIEW_IGNORED:
        return "NEEDS_REVIEW"
    if exp and exp < now() - timedelta(days=NEEDS_REVIEW_SILENT_DAYS) and parse_dt(a.get("updatedAt")) < now() - timedelta(days=NEEDS_REVIEW_SILENT_DAYS):
        return "NEEDS_REVIEW"
    if exp and exp.date() < now().date():
        return "OVERDUE"
    return "NORMAL"


def out_await(a: dict):
    a = clean(dict(a))
    a["attentionState"] = compute_attention(a)
    a["id"] = a.get("id")
    return a


async def add_event(await_id: str, user_id: str, type_: str, text: str, meta: dict | None = None):
    await db.events.insert_one({"id": uid("evt"), "awaitItemId": await_id, "user_id": user_id, "type": type_, "text": text, "meta": meta or {}, "createdAt": now()})


async def add_evidence(await_id: str, user_id: str, ev: dict):
    doc = {
        "id": uid("ev"), "awaitItemId": await_id, "user_id": user_id, "type": ev.get("type", "SHARED_TEXT"),
        "contentText": ev.get("contentText"), "uri": ev.get("uri"), "mimeType": ev.get("mimeType"),
        "fileName": ev.get("fileName"), "createdAt": now(), "explicitlySharedByUser": True,
    }
    await db.evidence.insert_one(doc)
    await db.awaits.update_one({"id": await_id}, {"$push": {"sourceEvidenceIds": doc["id"]}})
    return doc["id"]


async def active_count(user_id: str):
    return await db.awaits.count_documents({"user_id": user_id, "deleted_at": None, "state": {"$ne": "DONE"}})


async def get_owned(await_id: str, user: dict):
    a = await db.awaits.find_one({"id": await_id, "user_id": user["user_id"], "deleted_at": None}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Await not found")
    return a


@api.get("/awaits")
async def list_awaits(user=Depends(get_user), state: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None,
                      time: Optional[str] = None, sort: str = "due", attention: Optional[str] = None, include_done: bool = True):
    query: dict = {"user_id": user["user_id"], "deleted_at": None}
    if state:
        query["state"] = state
    elif not include_done:
        query["state"] = {"$ne": "DONE"}
    if category:
        query["category"] = category
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"ownerName": rx}, {"commitment": rx}, {"notes": rx}, {"title": rx}]
    docs = [out_await(d) for d in await db.awaits.find(query, {"_id": 0}).to_list(2000)]
    if attention:
        docs = [d for d in docs if d["attentionState"] == attention]
    if time:
        n = now()
        def in_window(d):
            e = parse_dt(d.get("expectedAt"))
            if not e:
                return False
            if time == "overdue":
                return d["attentionState"] == "OVERDUE"
            if time == "week":
                return n.date() <= e.date() <= (n + timedelta(days=7)).date()
            if time == "month":
                return n.date() <= e.date() <= (n + timedelta(days=31)).date()
            return True
        docs = [d for d in docs if in_window(d)]
    if sort == "recent":
        docs.sort(key=lambda d: d.get("createdAt") or "", reverse=True)
    elif sort == "az":
        docs.sort(key=lambda d: (d.get("ownerName") or "").lower())
    else:
        docs.sort(key=lambda d: (d.get("expectedAt") is None, d.get("expectedAt") or ""))
    if user.get("plan", "FREE") == "FREE":
        cutoff = now() - timedelta(days=30)
        docs = [d for d in docs if d["state"] != "DONE" or (parse_dt(d.get("completedAt")) or now()) >= cutoff]
    return docs


@api.post("/awaits", status_code=201)
async def create_await(body: AwaitIn, user=Depends(get_user)):
    if body.state != "DONE" and user.get("plan", "FREE") == "FREE" and await active_count(user["user_id"]) >= FREE_ACTIVE_LIMIT:
        raise HTTPException(402, detail={"code": "FREE_LIMIT", "active": FREE_ACTIVE_LIMIT})
    exp = parse_dt(body.expectedAt)
    doc = {
        "id": uid("aw"), "user_id": user["user_id"], "title": body.title or f"{body.ownerName} — {body.commitment}",
        "ownerName": body.ownerName.strip(), "commitment": body.commitment.strip(), "expectedAt": exp, "expectedText": body.expectedText,
        "expectedDateOnly": body.expectedDateOnly, "state": body.state if body.state in STATES else "THEIR_TURN",
        "attentionState": "NORMAL", "category": body.category if body.category in CATEGORIES else "OTHER", "notes": body.notes or "",
        "sourceType": body.sourceType if body.sourceType in SOURCE_TYPES else "MANUAL", "sourceAppLabel": body.sourceAppLabel,
        "sourceEvidenceIds": [], "createdAt": now(), "updatedAt": now(), "completedAt": None, "lastReminderAt": None,
        "nextReminderAt": exp, "reminderCount": 0, "ignoredReminderCount": 0, "lastFollowupAt": None, "nextCheckAt": None,
        "resolutionConfidence": None, "resolutionEvidenceId": None, "deleted_at": None,
    }
    await db.awaits.insert_one(doc)
    await add_event(doc["id"], user["user_id"], "CREATED", f"Created from {doc['sourceType'].replace('_', ' ').title()}")
    for ev in body.evidence or []:
        await add_evidence(doc["id"], user["user_id"], ev)
    return out_await(await db.awaits.find_one({"id": doc["id"]}, {"_id": 0}))


@api.get("/awaits/{await_id}")
async def get_await(await_id: str, user=Depends(get_user)):
    return out_await(await get_owned(await_id, user))


@api.patch("/awaits/{await_id}")
async def patch_await(await_id: str, body: AwaitPatch, user=Depends(get_user)):
    a = await get_owned(await_id, user)
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "expectedAt" in upd:
        new_exp = parse_dt(upd["expectedAt"])
        upd["expectedAt"] = new_exp
        upd["nextReminderAt"] = new_exp
        old = parse_dt(a.get("expectedAt"))
        if (old and old.date()) != (new_exp and new_exp.date()):
            await add_event(await_id, user["user_id"], "EXPECTED_CHANGED", f"Expected date changed to {new_exp.strftime('%d %b %Y') if new_exp else 'unset'}",
                            {"from": iso(old), "to": iso(new_exp)})
    upd["updatedAt"] = now()
    upd["title"] = f"{upd.get('ownerName', a['ownerName'])} — {upd.get('commitment', a['commitment'])}"
    await db.awaits.update_one({"id": await_id}, {"$set": upd})
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.delete("/awaits/{await_id}")
async def delete_await(await_id: str, user=Depends(get_user)):
    await get_owned(await_id, user)
    await db.awaits.update_one({"id": await_id}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


@api.post("/awaits/{await_id}/state")
async def set_state(await_id: str, body: StateIn, user=Depends(get_user)):
    a = await get_owned(await_id, user)
    if body.state not in STATES:
        raise HTTPException(400, "Invalid state")
    upd = {"state": body.state, "updatedAt": now()}
    if body.state == "DONE":
        upd.update({"completedAt": now(), "attentionState": "NORMAL", "nextReminderAt": None})
        await add_event(await_id, user["user_id"], "COMPLETED", "Marked as Done")
    else:
        if a["state"] == "DONE":
            upd.update({"completedAt": None, "nextReminderAt": a.get("expectedAt"), "ignoredReminderCount": 0})
            await add_event(await_id, user["user_id"], "REOPENED", f"Reopened — {body.state.replace('_', ' ').title()}")
        else:
            await add_event(await_id, user["user_id"], "STATE_CHANGED", f"State changed to {body.state.replace('_', ' ').title()}")
    await db.awaits.update_one({"id": await_id}, {"$set": upd})
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.post("/awaits/{await_id}/reopen")
async def reopen(await_id: str, body: ReopenIn, user=Depends(get_user)):
    return await set_state(await_id, StateIn(state=body.state if body.state in ("MY_TURN", "THEIR_TURN") else "THEIR_TURN"), user)


@api.post("/awaits/{await_id}/snooze")
async def snooze(await_id: str, body: SnoozeIn, user=Depends(get_user)):
    await get_owned(await_id, user)
    until = parse_dt(body.until) or (now() + timedelta(days=body.days or 1))
    await db.awaits.update_one({"id": await_id}, {"$set": {"nextReminderAt": until, "attentionState": "NORMAL", "ignoredReminderCount": 0, "updatedAt": now()}})
    await add_event(await_id, user["user_id"], "REMINDER_SCHEDULED", f"Reminder set for {until.strftime('%d %b %Y')}")
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.post("/awaits/{await_id}/followup-sent")
async def followup_sent(await_id: str, body: FollowupSentIn, user=Depends(get_user)):
    await get_owned(await_id, user)
    nxt = now() + timedelta(days=body.checkDays)
    await db.awaits.update_one({"id": await_id}, {"$set": {"lastFollowupAt": now(), "nextCheckAt": nxt, "nextReminderAt": nxt, "attentionState": "NORMAL", "ignoredReminderCount": 0, "updatedAt": now()}})
    await add_event(await_id, user["user_id"], "FOLLOWUP_RECORDED", f"Follow-up sent · next check {nxt.strftime('%d %b')}", {"text": body.text})
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.post("/awaits/{await_id}/apply-update")
async def apply_update(await_id: str, body: UpdateApplyIn, user=Depends(get_user)):
    a = await get_owned(await_id, user)
    upd = {"updatedAt": now(), "attentionState": "NORMAL", "ignoredReminderCount": 0}
    if body.expectedAt:
        ne = parse_dt(body.expectedAt)
        upd["expectedAt"] = ne
        upd["nextReminderAt"] = ne
        upd["expectedText"] = body.expectedText
        await add_event(await_id, user["user_id"], "EXPECTED_CHANGED", f"Expected date changed to {ne.strftime('%d %b %Y')}", {"from": iso(parse_dt(a.get('expectedAt'))), "to": iso(ne)})
    if body.note:
        upd["notes"] = (a.get("notes") or "") + ("\n" if a.get("notes") else "") + body.note
    await db.awaits.update_one({"id": await_id}, {"$set": upd})
    if body.evidence:
        await add_evidence(await_id, user["user_id"], body.evidence)
        await add_event(await_id, user["user_id"], "UPDATE_RECEIVED", "Shared update added as evidence")
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.post("/awaits/{await_id}/resolution")
async def resolution(await_id: str, body: ResolutionIn, user=Depends(get_user)):
    await get_owned(await_id, user)
    if body.evidence:
        eid = await add_evidence(await_id, user["user_id"], body.evidence)
        await db.awaits.update_one({"id": await_id}, {"$set": {"resolutionEvidenceId": eid}})
    if body.action == "close":
        return await set_state(await_id, StateIn(state="DONE"), user)
    if body.action == "remind_later":
        return await snooze(await_id, SnoozeIn(days=body.days or 1), user)
    await db.awaits.update_one({"id": await_id}, {"$set": {"attentionState": "NORMAL", "resolutionConfidence": None, "updatedAt": now()}})
    await add_event(await_id, user["user_id"], "STATE_CHANGED", "Still waiting — resolution dismissed")
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.post("/awaits/{await_id}/flag-resolution")
async def flag_resolution(await_id: str, body: Dict[str, Any], user=Depends(get_user)):
    await get_owned(await_id, user)
    await db.awaits.update_one({"id": await_id}, {"$set": {"attentionState": "POSSIBLE_RESOLUTION", "resolutionConfidence": body.get("confidence"), "nextReminderAt": None, "updatedAt": now()}})
    await add_event(await_id, user["user_id"], "RESOLUTION_SIGNAL", "Resolution signal detected — reminders paused")
    return out_await(await db.awaits.find_one({"id": await_id}, {"_id": 0}))


@api.get("/awaits/{await_id}/events")
async def events(await_id: str, user=Depends(get_user)):
    await get_owned(await_id, user)
    return [clean(e) for e in await db.events.find({"awaitItemId": await_id}, {"_id": 0}).sort("createdAt", -1).to_list(500)]


@api.get("/awaits/{await_id}/evidence")
async def list_evidence(await_id: str, user=Depends(get_user)):
    await get_owned(await_id, user)
    return [clean(e) for e in await db.evidence.find({"awaitItemId": await_id, "deleted_at": None}, {"_id": 0}).sort("createdAt", -1).to_list(200)]


@api.post("/awaits/{await_id}/evidence", status_code=201)
async def post_evidence(await_id: str, body: EvidenceIn, user=Depends(get_user)):
    await get_owned(await_id, user)
    eid = await add_evidence(await_id, user["user_id"], body.model_dump())
    await add_event(await_id, user["user_id"], "EVIDENCE_ADDED", f"Evidence added ({body.type.replace('_', ' ').title()})")
    return clean(await db.evidence.find_one({"id": eid}, {"_id": 0}))


@api.delete("/evidence/{evidence_id}")
async def delete_evidence(evidence_id: str, user=Depends(get_user)):
    r = await db.evidence.update_one({"id": evidence_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now()}})
    if not r.matched_count:
        raise HTTPException(404, "Evidence not found")
    return {"ok": True}


@api.get("/stats")
async def stats(user=Depends(get_user)):
    docs = [out_await(d) for d in await db.awaits.find({"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}).to_list(5000)]
    done = [d for d in docs if d["state"] == "DONE"]
    open_ = [d for d in docs if d["state"] != "DONE"]
    overdue = [d for d in open_ if d["attentionState"] == "OVERDUE"]
    cats = {c: len([d for d in docs if d["category"] == c]) for c in CATEGORIES}
    return {"total": len(docs), "done": len(done), "waiting": len(open_), "overdue": len(overdue), "myTurn": len([d for d in open_ if d["state"] == "MY_TURN"]),
            "needsReview": len([d for d in open_ if d["attentionState"] == "NEEDS_REVIEW"]), "categories": cats, "activeLimit": FREE_ACTIVE_LIMIT if user.get("plan", "FREE") == "FREE" else None}


@api.post("/reminders/tick")
async def reminders_tick(user=Depends(get_user)):
    """Reminder engine: returns due reminders and escalates ignored ones to NEEDS_REVIEW."""
    n = now()
    fired = []
    async for a in db.awaits.find({"user_id": user["user_id"], "deleted_at": None, "state": {"$ne": "DONE"}}, {"_id": 0}):
        nr = parse_dt(a.get("nextReminderAt"))
        if not nr or nr > n or a.get("attentionState") in ("POSSIBLE_RESOLUTION", "NEEDS_REVIEW"):
            continue
        ignored = a.get("ignoredReminderCount", 0) + 1
        upd = {"lastReminderAt": n, "reminderCount": a.get("reminderCount", 0) + 1, "ignoredReminderCount": ignored, "nextReminderAt": n + timedelta(days=1)}
        kind = "DUE"
        if ignored >= NEEDS_REVIEW_IGNORED:
            upd["attentionState"] = "NEEDS_REVIEW"
            upd["nextReminderAt"] = None
            kind = "NEEDS_REVIEW"
            await add_event(a["id"], user["user_id"], "NEEDS_REVIEW", "Moved to Needs Review — repeated reminders ignored")
        else:
            await add_event(a["id"], user["user_id"], "REMINDER_SENT", "Reminder sent")
            exp = parse_dt(a.get("expectedAt"))
            if exp and exp.date() < n.date():
                kind = "OVERDUE"
        await db.awaits.update_one({"id": a["id"]}, {"$set": upd})
        fired.append({"awaitId": a["id"], "kind": kind, "title": f"{a['ownerName']} hasn't {a['commitment'][0].lower() + a['commitment'][1:]} yet." if kind != "NEEDS_REVIEW" else f"{a['ownerName']} · {a['commitment']} needs review", "ownerName": a["ownerName"], "commitment": a["commitment"]})
    return {"fired": fired}


@api.post("/plan/upgrade")
async def upgrade(user=Depends(get_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan": "PRO"}})
    return {"ok": True, "plan": "PRO"}


@api.post("/plan/restore")
async def restore(user=Depends(get_user)):
    return {"ok": True, "plan": user.get("plan", "FREE")}


@api.post("/data/clear")
async def clear_data(user=Depends(get_user)):
    await db.awaits.update_many({"user_id": user["user_id"]}, {"$set": {"deleted_at": now()}})
    return {"ok": True}


# ----------------------------------------------------------------------------- Seed
async def seed_user(user_id: str):
    n = now()
    today = n.replace(hour=18, minute=0, second=0, microsecond=0)
    items = [
        ("Amazon", "Refund ₹3,499", today - timedelta(days=3), "REFUND", "THEIR_TURN", "SCREENSHOT", "Order #408-1234567-8901234. Refund expected within 7–10 business days."),
        ("Sameer", "Send quotation", today, "DOCUMENT", "THEIR_TURN", "SHARED_TEXT", "Sameer: I'll send you the quotation by Friday."),
        ("Rahul", "Referral confirmation", today + timedelta(days=4), "OTHER", "THEIR_TURN", "MANUAL", ""),
        ("Plumber", "Home visit", today + timedelta(days=6), "APPOINTMENT", "THEIR_TURN", "MANUAL", "Saturday morning, kitchen sink leak."),
        ("Insurance", "Claim response", today - timedelta(days=5), "DOCUMENT", "THEIR_TURN", "DOCUMENT", "InsuranceClaimLetter.pdf — claim #CLM-2291."),
        ("Airline", "Ticket refund ₹7,200", today - timedelta(days=20), "REFUND", "DONE", "SHARED_TEXT", ""),
        ("Amazon", "Return pickup", today - timedelta(days=25), "DELIVERY", "DONE", "MANUAL", ""),
    ]
    for owner, what, exp, cat, state, src, notes in items:
        doc = {
            "id": uid("aw"), "user_id": user_id, "title": f"{owner} — {what}", "ownerName": owner, "commitment": what, "expectedAt": exp, "expectedText": None,
            "expectedDateOnly": True, "state": state, "attentionState": "NORMAL", "category": cat, "notes": notes, "sourceType": src, "sourceAppLabel": None,
            "sourceEvidenceIds": [], "createdAt": n - timedelta(days=10), "updatedAt": n - timedelta(days=2), "completedAt": (exp + timedelta(days=2)) if state == "DONE" else None,
            "lastReminderAt": None, "nextReminderAt": exp if state != "DONE" else None, "reminderCount": 0, "ignoredReminderCount": 0, "lastFollowupAt": None,
            "nextCheckAt": None, "resolutionConfidence": None, "resolutionEvidenceId": None, "deleted_at": None,
        }
        await db.awaits.insert_one(doc)
        await db.events.insert_one({"id": uid("evt"), "awaitItemId": doc["id"], "user_id": user_id, "type": "CREATED", "text": f"Created from {src.replace('_', ' ').title()}", "meta": {}, "createdAt": n - timedelta(days=10)})
        if notes and src != "MANUAL":
            await db.evidence.insert_one({"id": uid("ev"), "awaitItemId": doc["id"], "user_id": user_id, "type": src, "contentText": notes, "uri": None, "mimeType": "text/plain" if src != "DOCUMENT" else "application/pdf",
                                          "fileName": "InsuranceClaimLetter.pdf" if src == "DOCUMENT" else None, "createdAt": n - timedelta(days=10), "explicitlySharedByUser": True, "deleted_at": None})
        if state == "DONE":
            await db.events.insert_one({"id": uid("evt"), "awaitItemId": doc["id"], "user_id": user_id, "type": "COMPLETED", "text": "Marked as Done", "meta": {}, "createdAt": doc["completedAt"]})


# ----------------------------------------------------------------------------- AI
class ExtractIn(BaseModel):
    text: Optional[str] = None
    image_base64: Optional[str] = None
    mime_type: Optional[str] = None
    file_name: Optional[str] = None
    source_type: str = "SHARED_TEXT"
    url: Optional[str] = None
    provider: Optional[str] = None  # openai | gemini


class FollowupIn(BaseModel):
    tone: str = "Polite"


class TranscribeIn(BaseModel):
    audio_base64: str
    mime_type: str = "audio/m4a"


EXTRACT_SYSTEM = """You are Await, an assistant that extracts commitments other people or companies owe the user (or the user owes others).
Return ONLY a compact JSON object with keys:
who (string, the person/company that owes the action, e.g. 'Amazon', 'Sameer'),
what (short imperative commitment, e.g. 'Send quotation', 'Refund ₹3,499'),
expected_text (human phrase like 'Friday' or 'within 7–10 business days', or null),
expected_at (ISO 8601 date computed from today's date given, or null when not determinable),
category (one of DELIVERY, REFUND, DOCUMENT, APPOINTMENT, PAYMENT, OTHER),
suggested_state (THEIR_TURN when someone else owes the action, MY_TURN when the user owes it),
completion_signal (true if the content says the commitment has already been fulfilled/processed/delivered/resolved),
confidence (0..1 how confident you are in who+what+expected).
If you cannot identify a commitment, return {"confidence": 0}."""

MATCH_SYSTEM = """You compare a new shared update against a list of the user's OPEN Await items (things they are waiting for).
Return ONLY JSON: {"candidateAwaitId": string|null, "relationshipConfidence": 0..1, "completionSignalConfidence": 0..1,
"suggestedChanges": {"expected_at": ISO date or null, "expected_text": string or null}, "shortExplanation": string}.
relationshipConfidence = how likely the update refers to that existing item. completionSignalConfidence = how likely the update says the item is now resolved (refund processed, delivered, document sent)."""


def extract_json(s: str):
    m = re.search(r"\{.*\}", s, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


async def llm(system: str, text: str, provider: str = "openai", image_b64: str | None = None, file: tuple | None = None) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType, TextDelta, StreamDone
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=uid("ai"), system_message=system)
    if provider == "gemini":
        chat.with_model("gemini", "gemini-3.1-pro-preview")
    else:
        chat.with_model("openai", "gpt-5.4")
    files = []
    if image_b64:
        files.append(ImageContent(image_base64=image_b64))
    if file:
        files.append(FileContentWithMimeType(file_path=file[0], mime_type=file[1]))
    msg = UserMessage(text=text, file_contents=files or None)
    out = ""
    async for ev in chat.stream_message(msg):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    return out


async def run_extract(body: ExtractIn):
    today = now().strftime("%A, %d %B %Y")
    parts = [f"Today is {today}."]
    if body.url:
        parts.append(f"Shared URL: {body.url}")
    if body.file_name:
        parts.append(f"Shared file: {body.file_name} ({body.mime_type})")
    if body.text:
        parts.append(f"Shared content:\n{body.text[:6000]}")
    if body.image_base64:
        parts.append("Read all text in the attached image (screenshot/photo) and extract the commitment.")
    prompt = "\n\n".join(parts)
    provider = body.provider or "openai"
    tmp = None
    file = None
    if body.mime_type == "application/pdf" and body.image_base64 and not body.text:
        provider = "gemini"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(base64.b64decode(body.image_base64))
        tmp.close()
        file = (tmp.name, "application/pdf")
    try:
        raw = await llm(EXTRACT_SYSTEM, prompt, provider, image_b64=None if file else body.image_base64, file=file)
    except Exception as e:
        logger.warning("primary provider failed: %s", e)
        raw = await llm(EXTRACT_SYSTEM, prompt, "gemini" if provider == "openai" else "openai", image_b64=None if file else body.image_base64, file=file)
    finally:
        if tmp:
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
    return extract_json(raw) or {"confidence": 0}


@api.post("/ai/extract")
async def ai_extract(body: ExtractIn, user=Depends(get_user)):
    if user.get("plan", "FREE") == "FREE" and user.get("ai_extractions_used", 0) >= FREE_AI_EXTRACTIONS:
        raise HTTPException(402, detail={"code": "AI_LIMIT", "limit": FREE_AI_EXTRACTIONS})
    if not (body.text or body.image_base64 or body.url):
        raise HTTPException(400, "Nothing to analyze")
    data = await run_extract(body)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"ai_extractions_used": 1}})
    conf = float(data.get("confidence") or 0)
    ok = conf >= 0.4 and data.get("who") and data.get("what")
    result = {
        "ok": bool(ok),
        "extraction": {
            "who": data.get("who"), "what": data.get("what"), "expected_text": data.get("expected_text"), "expected_at": data.get("expected_at"),
            "category": data.get("category") if data.get("category") in CATEGORIES else "OTHER",
            "suggested_state": data.get("suggested_state") if data.get("suggested_state") in ("MY_TURN", "THEIR_TURN") else "THEIR_TURN",
            "completion_signal": bool(data.get("completion_signal")), "confidence": conf,
        } if ok else None,
        "match": None,
    }
    # Matching against open Awaits
    open_items = await db.awaits.find({"user_id": user["user_id"], "deleted_at": None, "state": {"$ne": "DONE"}}, {"_id": 0}).to_list(200)
    if open_items and (body.text or ok):
        listing = "\n".join(f"- id={a['id']} | who={a['ownerName']} | what={a['commitment']} | expected={iso(parse_dt(a.get('expectedAt')))}" for a in open_items)
        summary = body.text[:3000] if body.text else json.dumps(result["extraction"])
        try:
            raw = await llm(MATCH_SYSTEM, f"Today is {now().strftime('%A, %d %B %Y')}.\nOPEN AWAITS:\n{listing}\n\nNEW UPDATE:\n{summary}", body.provider or "openai")
            m = extract_json(raw)
            if m and m.get("candidateAwaitId"):
                cand = next((a for a in open_items if a["id"] == m["candidateAwaitId"]), None)
                if cand:
                    result["match"] = {
                        "candidateAwaitId": cand["id"], "candidate": out_await(cand),
                        "relationshipConfidence": float(m.get("relationshipConfidence") or 0),
                        "completionSignalConfidence": float(m.get("completionSignalConfidence") or 0),
                        "suggestedChanges": m.get("suggestedChanges") or {}, "shortExplanation": m.get("shortExplanation") or "",
                    }
        except Exception as e:
            logger.warning("match failed: %s", e)
    return result


@api.post("/awaits/{await_id}/followup-draft")
async def followup_draft(await_id: str, body: FollowupIn, user=Depends(get_user)):
    a = await get_owned(await_id, user)
    if user.get("plan", "FREE") == "FREE" and user.get("ai_followups_used", 0) >= FREE_AI_FOLLOWUPS:
        raise HTTPException(402, detail={"code": "AI_LIMIT", "limit": FREE_AI_FOLLOWUPS})
    exp = parse_dt(a.get("expectedAt"))
    prompt = (f"Write a short {body.tone.lower()} follow-up message from {user.get('name', 'me')} to {a['ownerName']} about: {a['commitment']}. "
              f"It was expected by {exp.strftime('%b %d, %Y') if exp else 'the agreed date'}. Notes: {a.get('notes') or 'none'}. "
              f"Ask them to confirm the status. Plain text, greeting + 2-3 sentences + sign-off with the name {user.get('name', '')}. No subject line.")
    try:
        draft = await llm("You draft concise follow-up messages. Output only the message text.", prompt, "openai")
    except Exception:
        draft = await llm("You draft concise follow-up messages. Output only the message text.", prompt, "gemini")
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"ai_followups_used": 1}})
    await add_event(await_id, user["user_id"], "FOLLOWUP_DRAFTED", f"Follow-up drafted ({body.tone})")
    return {"draft": draft.strip(), "tone": body.tone}


@api.post("/ai/transcribe")
async def transcribe(body: TranscribeIn, user=Depends(get_user)):
    ext = ".m4a" if "m4a" in body.mime_type or "mp4" in body.mime_type else ".webm" if "webm" in body.mime_type else ".wav"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(base64.b64decode(body.audio_base64))
    tmp.close()
    try:
        text = await llm("Transcribe the audio exactly. Output only the transcript text.", "Transcribe this recording.", "gemini", file=(tmp.name, body.mime_type))
    finally:
        os.unlink(tmp.name)
    return {"transcript": text.strip()}


@api.get("/health")
async def health():
    return {"ok": True, "service": "await"}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.awaits.create_index([("user_id", 1), ("deleted_at", 1)])
    await db.events.create_index("awaitItemId")
    await db.evidence.create_index("awaitItemId")


@app.on_event("shutdown")
async def shutdown():
    client.close()
