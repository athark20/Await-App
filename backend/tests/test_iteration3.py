"""Iteration 3 tests: password reset, DOCX/XLSX extract, summary/today."""
import io
import base64
import asyncio
import uuid
import pytest
import requests
import bcrypt
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

from conftest import API

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


def _now():
    return datetime.now(timezone.utc)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ------------------------------------------- Password Reset ---
class TestPasswordReset:
    def test_forgot_returns_ok_for_known(self, api):
        r = api.post(f"{API}/auth/forgot", json={"email": "delivered@resend.dev"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_returns_ok_for_unknown(self, api):
        r = api.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        assert r.json().get("ok") is True  # no enumeration

    def test_reset_bad_code_returns_400(self, api):
        # trigger a forgot to make sure there's a doc, then wrong code
        api.post(f"{API}/auth/forgot", json={"email": "delivered@resend.dev"})
        r = api.post(f"{API}/auth/reset", json={"email": "delivered@resend.dev", "code": "000000", "new_password": "abcdef1"})
        assert r.status_code == 400
        assert "Invalid" in (r.json().get("detail") or "")

    def test_reset_success_via_seeded_code(self, api):
        """Insert a known-hash password_resets doc, reset, log in, then restore."""
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]

        async def seed(code, new_pw_min_len_ok=True):
            code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
            # invalidate any existing unused ones so ours becomes the "most recent"
            await db.password_resets.insert_one({
                "id": f"pr_{uuid.uuid4().hex[:10]}",
                "email": "delivered@resend.dev",
                "code_hash": code_hash,
                "created_at": _now() + timedelta(seconds=1),  # ensure it's latest
                "expires_at": _now() + timedelta(minutes=15),
                "used": False,
                "attempts": 0,
            })

        async def cleanup():
            await db.password_resets.delete_many({"email": "delivered@resend.dev"})

        try:
            code1 = "424242"
            _run(seed(code1))
            r = api.post(f"{API}/auth/reset", json={
                "email": "delivered@resend.dev", "code": code1, "new_password": "newpass123"
            })
            assert r.status_code == 200, r.text
            data = r.json()
            assert "session_token" in data and data["user"]["email"] == "delivered@resend.dev"

            # Login with new password
            r = api.post(f"{API}/auth/login", json={"email": "delivered@resend.dev", "password": "newpass123"})
            assert r.status_code == 200

            # Restore password back
            _run(cleanup())
            code2 = "313131"
            _run(seed(code2))
            r = api.post(f"{API}/auth/reset", json={
                "email": "delivered@resend.dev", "code": code2, "new_password": "password123"
            })
            assert r.status_code == 200

            r = api.post(f"{API}/auth/login", json={"email": "delivered@resend.dev", "password": "password123"})
            assert r.status_code == 200
        finally:
            _run(cleanup())
            client.close()


# ------------------------------------------- Document extraction ---
def _mk_docx() -> bytes:
    import docx
    d = docx.Document()
    d.add_paragraph("ABC Insurance will respond to claim CLM-2291 by 30 September 2026.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _mk_xlsx() -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Vendor", "Item", "Expected"])
    ws.append(["ABC Insurance", "Claim CLM-2291 response", "30 September 2026"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestExtractDocs:
    @pytest.fixture(scope="class")
    def user(self, api):
        email = f"docext_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={"name": "DocExt", "email": email, "password": "password123"})
        assert r.status_code in (200, 201)
        tok = r.json()["session_token"]
        return {"h": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}

    def test_docx_extract(self, api, user):
        b64 = base64.b64encode(_mk_docx()).decode()
        r = api.post(f"{API}/ai/extract", json={
            "image_base64": b64,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "file_name": "claim.docx",
            "source_type": "SHARED_FILE",
        }, headers=user["h"], timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True, f"expected ok=True, got {d}"
        who = ((d.get("extraction") or {}).get("who") or "").lower()
        assert "abc" in who or "insurance" in who, f"who={who}"

    def test_xlsx_extract(self, api, user):
        b64 = base64.b64encode(_mk_xlsx()).decode()
        r = api.post(f"{API}/ai/extract", json={
            "image_base64": b64,
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "file_name": "claim.xlsx",
            "source_type": "SHARED_FILE",
        }, headers=user["h"], timeout=90)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_legacy_doc_unsupported(self, api, user):
        b64 = base64.b64encode(b"\xD0\xCF\x11\xE0" + b"random bytes " * 20).decode()
        r = api.post(f"{API}/ai/extract", json={
            "image_base64": b64,
            "mime_type": "application/msword",
            "file_name": "legacy.doc",
            "source_type": "SHARED_FILE",
        }, headers=user["h"], timeout=30)
        assert r.status_code == 415, r.text
        d = r.json().get("detail")
        code = d.get("code") if isinstance(d, dict) else None
        assert code == "UNSUPPORTED_FILE", f"expected UNSUPPORTED_FILE, got {d}"


# ------------------------------------------- Summary Today ---
class TestSummaryToday:
    def test_summary_alex(self, api, alex_h):
        r = api.get(f"{API}/summary/today", headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("due"), int)
        assert isinstance(d.get("overdue"), int)
        assert isinstance(d.get("body"), str)
        assert d["overdue"] >= 2, f"alex should have >=2 overdue, got {d}"
