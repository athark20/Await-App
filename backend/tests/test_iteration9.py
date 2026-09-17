"""Iteration 9 hardening tests.

Covers:
- Login rate limiting (per-email 10/15min, per-IP 20/15min)
- Guest signup rate limiting (per-IP 5/hour)
- Upload size cap (>15MB decoded) returns 413 FILE_TOO_LARGE before decode
- DOCX zip-bomb expansion > 60MB returns 413 FILE_TOO_LARGE
- Small DOCX still extracts (200 or 402 AI_LIMIT if quota exhausted)
- Negative amount on /api/awaits POST is normalised to null
- CORS: preflight OPTIONS /api/health returns Allow-Origin '*' and NO Allow-Credentials
- X-Plan header absent still allows GET /api/awaits and /api/stats (200)

Order-critical: alex login FIRST (uses 1 of 20 per-IP + 1 of 10 per-email),
then throttle test with a DIFFERENT throwaway email (uses 11 more per-IP counts).
Total login calls from this IP: 1 (alex) + 11 (throwaway) = 12, safely under 20.
"""
import base64
import io
import os
import uuid
import wave
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://await-android.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ------------------------------------------------------------------ AUTH / RATE LIMIT
class TestLoginAndRateLimit:
    """Login basic behavior + per-email rate-limiting."""

    def test_01_alex_login_success(self, api):
        # RUN FIRST: happy-path login for alex (also warms alex_h via conftest fixture reuse elsewhere).
        r = api.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "password123"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_token" in body and isinstance(body["session_token"], str) and len(body["session_token"]) > 10
        assert body.get("user", {}).get("email") == "alex@example.com"

    def test_02_wrong_password_returns_401(self, api):
        # Use a throwaway email so we don't burn alex's per-email login bucket.
        r = api.post(f"{API}/auth/login", json={"email": f"nobody+wp_{uuid.uuid4().hex[:6]}@await.local", "password": "wrong"})
        # unregistered email -> 401 (invalid credentials), not 429
        assert r.status_code == 401, r.text

    def test_03_login_rate_limit_11th_returns_429(self, api):
        """Hammer the per-email bucket with 11 wrong attempts on a single throwaway email.
        Expected: attempts 1-10 return 401, attempt 11 returns 429 RATE_LIMITED.
        This consumes 11 of the per-IP 20/15min bucket. Test 01 used 1. Total ≤12."""
        throwaway = f"nobody+rl_{uuid.uuid4().hex[:8]}@await.local"
        statuses = []
        got_429 = False
        for i in range(11):
            r = api.post(f"{API}/auth/login", json={"email": throwaway, "password": "wrongpw"})
            statuses.append(r.status_code)
            if r.status_code == 429:
                got_429 = True
                # Verify shape once the throttle fires
                try:
                    body = r.json()
                except Exception:
                    body = {}
                detail = body.get("detail", {})
                assert isinstance(detail, dict) and detail.get("code") == "RATE_LIMITED", body
                break
        assert got_429, f"Expected 429 within 11 attempts; got statuses={statuses}"
        # 429 should occur on the 11th attempt (bucket = 10 / 15 min).
        assert statuses[-1] == 429
        # First 10 should have been 401s (unregistered email + wrong password), never 429 until the last.
        assert all(s == 401 for s in statuses[:-1]), statuses


# ------------------------------------------------------------------ GUEST RATE LIMIT
class TestGuestRateLimit:
    """Per-IP guest limit 5/hour. Accepts either the full 5+1 pattern OR immediate 429
    (shared-IP scenario in the container network)."""

    def test_guest_rate_limit(self, api):
        results = []
        for i in range(6):
            r = api.post(f"{API}/auth/guest")
            results.append(r.status_code)
            if r.status_code == 429:
                try:
                    detail = r.json().get("detail", {})
                except Exception:
                    detail = {}
                assert isinstance(detail, dict) and detail.get("code") == "RATE_LIMITED"
        # Either the 6th call is 429 (fresh bucket) OR any call is 429 (shared IP already throttled).
        assert 429 in results, f"Expected at least one 429 in guest hammer; got {results}"
        # If we got any 200s, they must all come before the first 429.
        if 200 in results:
            first_429 = results.index(429)
            assert all(s == 200 for s in results[:first_429]), results


# ------------------------------------------------------------------ UPLOAD SIZE CAPS
class TestUploadSizeCap:
    """15 MB decoded size cap on /ai/transcribe and /ai/extract, enforced pre-decode."""

    def test_transcribe_413_when_oversized(self, api, alex_h):
        # base64 length > 15MB * 4/3 triggers pre-decode 413 (very fast, no memory blowup).
        # 15MB * 4/3 = 20,971,520. Use 21_000_000 A's -> ~21 MB base64 string.
        oversize_b64 = "A" * 21_000_000
        r = api.post(f"{API}/ai/transcribe", headers=alex_h,
                     json={"audio_base64": oversize_b64, "mime_type": "audio/wav"})
        assert r.status_code == 413, r.text
        detail = r.json().get("detail", {})
        assert isinstance(detail, dict) and detail.get("code") == "FILE_TOO_LARGE", detail

    def test_extract_413_when_image_oversized(self, api, fresh_user):
        # Use a fresh user so AI quota (5/mo free) doesn't 402 before the size check.
        oversize_b64 = "A" * 21_000_000
        r = api.post(f"{API}/ai/extract", headers=fresh_user["headers"],
                     json={"image_base64": oversize_b64, "mime_type": "image/png", "source_type": "IMAGE"})
        assert r.status_code == 413, r.text
        detail = r.json().get("detail", {})
        assert isinstance(detail, dict) and detail.get("code") == "FILE_TOO_LARGE", detail

    def test_transcribe_small_wav_still_ok(self, api, alex_h):
        """A tiny 1-second silence WAV should not trip the size cap.
        Accept 200 (normal) or 402 AI_LIMIT (alex exhausted quota). Never 413/500."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(b"\x00\x00" * 16000)  # 1 second silence
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        r = api.post(f"{API}/ai/transcribe", headers=alex_h,
                     json={"audio_base64": b64, "mime_type": "audio/wav"})
        # Must not be 413 and must not 5xx.
        assert r.status_code < 500, r.text
        assert r.status_code != 413, r.text
        # Expected happy path is 200 with "transcript" key.
        if r.status_code == 200:
            assert "transcript" in r.json()


# ------------------------------------------------------------------ ZIP BOMB
class TestDocxZipBomb:
    """DOCX archive expansion cap: >60MB uncompressed -> 413 FILE_TOO_LARGE."""

    @staticmethod
    def _make_zip_bomb(inner_size: int) -> bytes:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            # Highly-compressible payload; balloons to `inner_size` on extraction.
            z.writestr("word/document.xml", b"\x00" * inner_size)
        return buf.getvalue()

    @staticmethod
    def _make_real_docx(text: str) -> bytes:
        try:
            from docx import Document  # python-docx
        except ImportError:
            pytest.skip("python-docx not installed")
        buf = io.BytesIO()
        d = Document()
        d.add_paragraph(text)
        d.save(buf)
        return buf.getvalue()

    def test_zip_bomb_returns_413(self, api, fresh_user):
        # Use a fresh user so AI quota doesn't 402 before the zip-expansion check.
        bomb = self._make_zip_bomb(70 * 1024 * 1024)  # 70MB inner
        b64 = base64.b64encode(bomb).decode("ascii")
        # Confirm the compressed bytes ARE small (else we'd hit the 15MB pre-decode cap first)
        assert len(bomb) < 15 * 1024 * 1024, f"zip bomb too big compressed: {len(bomb)}"
        r = api.post(f"{API}/ai/extract", headers=fresh_user["headers"], json={
            "image_base64": b64,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "file_name": "bomb.docx",
            "source_type": "DOCUMENT",
        })
        assert r.status_code == 413, r.text
        detail = r.json().get("detail", {})
        assert isinstance(detail, dict) and detail.get("code") == "FILE_TOO_LARGE", detail

    def test_small_docx_still_extracts(self, api, alex_h, fresh_user):
        """Use a fresh registered user to avoid alex's FREE quota (5/mo)."""
        docx = self._make_real_docx("ABC Insurance will send the claim response by 30 Sep")
        b64 = base64.b64encode(docx).decode("ascii")
        r = api.post(f"{API}/ai/extract", headers=fresh_user["headers"], json={
            "image_base64": b64,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "file_name": "ok.docx",
            "source_type": "DOCUMENT",
        })
        # Must not 413 and must not 5xx; 200 preferred, 402 AI_LIMIT acceptable if fresh user somehow throttled.
        assert r.status_code < 500, r.text
        assert r.status_code != 413, r.text
        if r.status_code == 200:
            body = r.json()
            assert "ok" in body  # extraction envelope
            # If extraction succeeded, ok True or False is fine; just verify schema
            assert body["ok"] in (True, False)


# ------------------------------------------------------------------ NEGATIVE AMOUNT
class TestNegativeAmount:
    def test_negative_amount_normalised_to_null(self, api, alex_h):
        r = api.post(f"{API}/awaits", headers=alex_h, json={
            "ownerName": "Neg",
            "commitment": "x",
            "amount": -50,
        })
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("amount") is None, f"Expected amount null, got {body.get('amount')}"
        created_id = body["id"]
        # GET verifies persistence
        rg = api.get(f"{API}/awaits/{created_id}", headers=alex_h)
        assert rg.status_code == 200, rg.text
        assert rg.json().get("amount") is None
        # Cleanup
        rd = api.delete(f"{API}/awaits/{created_id}", headers=alex_h)
        assert rd.status_code in (200, 204), rd.text


# ------------------------------------------------------------------ CORS PREFLIGHT
class TestCorsPreflight:
    def test_options_health_no_credentials(self, api):
        r = api.options(f"{API}/health", headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        })
        assert r.status_code in (200, 204), r.text
        # Wildcard allow-origin
        assert r.headers.get("access-control-allow-origin") == "*", dict(r.headers)
        # Explicitly NO allow-credentials header
        acac = r.headers.get("access-control-allow-credentials")
        assert acac is None or acac.lower() == "false", f"Unexpected ACAC header: {acac!r}"


# ------------------------------------------------------------------ X-PLAN ABSENT
class TestXPlanAbsentStillWorks:
    def test_awaits_and_stats_without_xplan_header(self, api, alex_token):
        # Deliberately no X-Plan header.
        headers = {"Authorization": f"Bearer {alex_token}", "Content-Type": "application/json"}
        r1 = api.get(f"{API}/awaits", headers=headers)
        assert r1.status_code == 200, r1.text
        assert isinstance(r1.json(), list) or isinstance(r1.json(), dict)
        r2 = api.get(f"{API}/stats", headers=headers)
        assert r2.status_code == 200, r2.text
