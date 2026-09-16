"""Iteration 6 backend tests:
- GET /api/stats/monthly?months=6 / months=3
- POST /api/owners/{name}/followup-draft (with AI_LIMIT fallback to fresh user)
- POST /api/owners/{name}/followup-sent
- POST /api/awaits with reminderLeadDays → nextReminderAt & REMINDER_SCHEDULED event
"""
import re
from datetime import datetime, timedelta, timezone

import pytest
from conftest import API


# ---------- /api/stats/monthly ----------
class TestStatsMonthly:
    def test_monthly_6_months_shape_and_reconcile(self, api, alex_h):
        r = api.get(f"{API}/stats/monthly", params={"months": 6}, headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "months" in d and "currency" in d
        assert isinstance(d["currency"], str) and len(d["currency"]) == 3
        months = d["months"]
        assert isinstance(months, list) and len(months) == 6, f"expected 6 months, got {len(months)}"

        # Each month has expected keys
        for m in months:
            for k in ("month", "label", "opened", "closed", "owed", "recovered"):
                assert k in m, f"month bucket missing {k}: {m}"
            assert re.match(r"^\d{4}-\d{2}$", m["month"]), f"bad month key {m['month']}"
            assert isinstance(m["opened"], int)
            assert isinstance(m["closed"], int)

        # Last entry is current month
        today = datetime.now(timezone.utc)
        cur = f"{today.year}-{today.month:02d}"
        assert months[-1]["month"] == cur, f"last month {months[-1]['month']} != current {cur}"

        # Reconcile opened counts with awaits createdAt
        aw = api.get(f"{API}/awaits", headers=alex_h).json()
        by_month = {}
        for a in aw:
            c = a.get("createdAt")
            if not c:
                continue
            # parse ISO (may have Z or offset)
            try:
                dt = datetime.fromisoformat(c.replace("Z", "+00:00"))
            except Exception:
                continue
            key = f"{dt.year}-{dt.month:02d}"
            by_month[key] = by_month.get(key, 0) + 1
        for m in months:
            assert m["opened"] == by_month.get(m["month"], 0), \
                f"opened mismatch for {m['month']}: got {m['opened']}, expected {by_month.get(m['month'], 0)}"

    def test_monthly_3_returns_3(self, api, alex_h):
        r = api.get(f"{API}/stats/monthly", params={"months": 3}, headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["months"]) == 3, f"expected 3 got {len(d['months'])}"


# ---------- /api/owners/{name}/followup-draft & followup-sent ----------
class TestOwnerFollowup:
    def test_owner_followup_draft_amazon_or_ai_limit(self, api, alex_h, alex_token):
        r = api.post(f"{API}/owners/amazon/followup-draft",
                     json={"tone": "Polite"}, headers=alex_h)
        if r.status_code == 402:
            body = r.json()
            # detail may be nested by fastapi
            detail = body.get("detail", body)
            assert (detail.get("code") if isinstance(detail, dict) else None) == "AI_LIMIT", body
            # Register fresh throwaway user (seed contains Amazon)
            import uuid
            email = f"test_it6_{uuid.uuid4().hex[:8]}@example.com"
            rr = api.post(f"{API}/auth/register",
                          json={"name": "It6User", "email": email, "password": "password123"})
            assert rr.status_code in (200, 201), rr.text
            token = rr.json()["session_token"]
            fh = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            r2 = api.post(f"{API}/owners/amazon/followup-draft",
                          json={"tone": "Polite"}, headers=fh)
            assert r2.status_code == 200, r2.text
            d = r2.json()
        else:
            assert r.status_code == 200, r.text
            d = r.json()

        # Validate draft shape
        assert "draft" in d and isinstance(d["draft"], str) and len(d["draft"]) > 0
        assert "tone" in d and d["tone"] == "Polite"
        assert "items" in d and isinstance(d["items"], list) and len(d["items"]) >= 1
        # Contains 'Refund' or '3,499'
        assert ("Refund" in d["draft"]) or ("3,499" in d["draft"]) or ("refund" in d["draft"].lower()), \
            f"draft missing Refund/3,499: {d['draft'][:400]}"
        # NO em-dash
        assert "\u2014" not in d["draft"], f"draft contains em-dash: {d['draft'][:400]}"

    def test_owner_followup_draft_unknown_owner_404(self, api, alex_h):
        r = api.post(f"{API}/owners/nobody/followup-draft",
                     json={"tone": "Polite"}, headers=alex_h)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_owner_followup_sent_rahul(self, api, alex_h):
        r = api.post(f"{API}/owners/rahul/followup-sent",
                     json={"checkDays": 3, "text": "hi"}, headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["updated"] >= 1, f"updated {d['updated']}"
        assert isinstance(d["items"], list) and len(d["items"]) == d["updated"]

        # Pick first item and verify nextCheckAt ~ now+3d
        it = d["items"][0]
        assert it.get("nextCheckAt"), f"nextCheckAt missing: {it}"
        try:
            nca = datetime.fromisoformat(it["nextCheckAt"].replace("Z", "+00:00"))
        except Exception:
            pytest.fail(f"bad nextCheckAt {it['nextCheckAt']}")
        target = datetime.now(timezone.utc) + timedelta(days=3)
        delta = abs((nca - target).total_seconds())
        assert delta < 3600, f"nextCheckAt {nca.isoformat()} not ~ now+3d (delta {delta}s)"

        # Verify FOLLOWUP_RECORDED event
        ev = api.get(f"{API}/awaits/{it['id']}/events", headers=alex_h)
        assert ev.status_code == 200
        events = ev.json()
        assert any(e.get("type") == "FOLLOWUP_RECORDED" for e in events), \
            f"FOLLOWUP_RECORDED not in events: {[e.get('type') for e in events]}"


# ---------- reminderLeadDays on POST /awaits ----------
class TestReminderLeadDays:
    def test_create_with_lead_days_schedules_early_reminder(self, api, alex_h):
        exp = datetime.now(timezone.utc) + timedelta(days=10)
        payload = {
            "ownerName": "Lead Test",
            "commitment": "Send file",
            "expectedAt": exp.isoformat(),
            "reminderLeadDays": 3,
        }
        r = api.post(f"{API}/awaits", json=payload, headers=alex_h)
        assert r.status_code == 201, r.text
        d = r.json()
        aid = d["id"]
        try:
            assert d.get("nextReminderAt"), "nextReminderAt missing"
            nr = datetime.fromisoformat(d["nextReminderAt"].replace("Z", "+00:00"))
            target = exp - timedelta(days=3)
            delta = abs((nr - target).total_seconds())
            assert delta < 3600, f"nextReminderAt {nr.isoformat()} not ~ expectedAt-3d (delta {delta}s)"

            # Event has REMINDER_SCHEDULED with 'Early reminder'
            ev = api.get(f"{API}/awaits/{aid}/events", headers=alex_h)
            assert ev.status_code == 200
            events = ev.json()
            match = [e for e in events if e.get("type") == "REMINDER_SCHEDULED"
                     and "Early reminder" in (e.get("text") or "")]
            assert match, f"REMINDER_SCHEDULED event with 'Early reminder' not found. Events: {events}"
        finally:
            dr = api.delete(f"{API}/awaits/{aid}", headers=alex_h)
            assert dr.status_code == 200
