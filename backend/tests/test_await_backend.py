"""Backend regression tests for Await app."""
import uuid, time, pytest, requests
from conftest import API


# --------------------------------------------------------------------- Auth
class TestAuth:
    def test_register_seeds_7(self, api, fresh_user):
        h = fresh_user["headers"]
        r = api.get(f"{API}/awaits", headers=h)
        assert r.status_code == 200
        awaits = r.json()
        assert len(awaits) == 7, f"Expected 7 seeded awaits, got {len(awaits)}"
        assert sum(1 for a in awaits if a["state"] != "DONE") == 5
        assert sum(1 for a in awaits if a["state"] == "DONE") == 2

    def test_alex_login(self, api):
        r = api.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "password123"})
        assert r.status_code == 200
        d = r.json()
        assert "session_token" in d and d["user"]["email"] == "alex@example.com"

    def test_wrong_password_401(self, api):
        r = api.post(f"{API}/auth/login", json={"email": "alex@example.com", "password": "WRONG"})
        assert r.status_code == 401

    def test_me(self, api, alex_h):
        r = api.get(f"{API}/auth/me", headers=alex_h)
        assert r.status_code == 200
        assert r.json()["email"] == "alex@example.com"

    def test_me_401_missing_token(self, api):
        r = api.get(f"{API}/auth/me")
        assert r.status_code == 401


# --------------------------------------------------------------------- List / Filters
class TestListFilters:
    def test_include_done_false_returns_5(self, api, fresh_user):
        h = fresh_user["headers"]
        r = api.get(f"{API}/awaits?include_done=false", headers=h)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) == 5
        # Amazon & Insurance should be OVERDUE
        overdue = {d["ownerName"] for d in docs if d["attentionState"] == "OVERDUE"}
        assert {"Amazon", "Insurance"} <= overdue, f"Expected Amazon & Insurance overdue, got {overdue}"

    def test_state_done_filter(self, api, fresh_user):
        r = api.get(f"{API}/awaits?state=DONE", headers=fresh_user["headers"])
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 1 and all(d["state"] == "DONE" for d in docs)

    def test_category_refund(self, api, fresh_user):
        r = api.get(f"{API}/awaits?category=REFUND", headers=fresh_user["headers"])
        assert r.status_code == 200
        assert all(d["category"] == "REFUND" for d in r.json())

    def test_q_sameer(self, api, fresh_user):
        r = api.get(f"{API}/awaits?q=Sameer", headers=fresh_user["headers"])
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1 and d[0]["ownerName"] == "Sameer"

    def test_time_overdue(self, api, fresh_user):
        r = api.get(f"{API}/awaits?time=overdue&include_done=false", headers=fresh_user["headers"])
        assert r.status_code == 200
        docs = r.json()
        assert all(d["attentionState"] == "OVERDUE" for d in docs)
        assert len(docs) >= 2

    def test_sort_az(self, api, fresh_user):
        r = api.get(f"{API}/awaits?sort=az&include_done=false", headers=fresh_user["headers"])
        assert r.status_code == 200
        names = [d["ownerName"].lower() for d in r.json()]
        assert names == sorted(names)


# --------------------------------------------------------------------- CRUD & workflow
class TestAwaitCRUD:
    @pytest.fixture(scope="class")
    def user(self, api):
        email = f"crud_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={"name": "Crud", "email": email, "password": "password123"})
        assert r.status_code in (200, 201)
        tok = r.json()["session_token"]
        return {"h": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}

    def test_full_lifecycle(self, api, user):
        h = user["h"]
        # Create
        payload = {"ownerName": "TEST_Bob", "commitment": "Send invoice", "category": "PAYMENT", "expectedAt": "2026-02-15T12:00:00+00:00"}
        r = api.post(f"{API}/awaits", json=payload, headers=h)
        assert r.status_code == 201, r.text
        a = r.json()
        aid = a["id"]
        assert a["ownerName"] == "TEST_Bob"

        # PATCH notes
        r = api.patch(f"{API}/awaits/{aid}", json={"notes": "updated notes"}, headers=h)
        assert r.status_code == 200 and r.json()["notes"] == "updated notes"

        # State DONE
        r = api.post(f"{API}/awaits/{aid}/state", json={"state": "DONE"}, headers=h)
        assert r.status_code == 200
        j = r.json()
        assert j["state"] == "DONE" and j["completedAt"]
        # Event COMPLETED
        r = api.get(f"{API}/awaits/{aid}/events", headers=h)
        assert r.status_code == 200
        assert any(e["type"] == "COMPLETED" for e in r.json())

        # Reopen
        r = api.post(f"{API}/awaits/{aid}/reopen", json={"state": "THEIR_TURN"}, headers=h)
        assert r.status_code == 200 and r.json()["state"] == "THEIR_TURN"

        # Snooze 3 days
        r = api.post(f"{API}/awaits/{aid}/snooze", json={"days": 3}, headers=h)
        assert r.status_code == 200 and r.json()["nextReminderAt"]

        # Followup-sent
        r = api.post(f"{API}/awaits/{aid}/followup-sent", json={"checkDays": 3}, headers=h)
        assert r.status_code == 200 and r.json()["lastFollowupAt"]

        # apply-update (change expectedAt + evidence)
        r = api.post(f"{API}/awaits/{aid}/apply-update", json={
            "expectedAt": "2026-03-01T12:00:00+00:00", "expectedText": "next month",
            "evidence": {"type": "SHARED_TEXT", "contentText": "New date confirmed."}}, headers=h)
        assert r.status_code == 200
        r = api.get(f"{API}/awaits/{aid}/events", headers=h)
        types = [e["type"] for e in r.json()]
        assert "EXPECTED_CHANGED" in types

        # Resolution — close
        r = api.post(f"{API}/awaits/{aid}/resolution", json={"action": "close"}, headers=h)
        assert r.status_code == 200 and r.json()["state"] == "DONE"

        # Reopen, then still_waiting
        api.post(f"{API}/awaits/{aid}/reopen", json={"state": "THEIR_TURN"}, headers=h)
        r = api.post(f"{API}/awaits/{aid}/resolution", json={"action": "still_waiting"}, headers=h)
        assert r.status_code == 200

        # remind_later
        r = api.post(f"{API}/awaits/{aid}/resolution", json={"action": "remind_later", "days": 2}, headers=h)
        assert r.status_code == 200

        # POST evidence
        r = api.post(f"{API}/awaits/{aid}/evidence", json={"type": "SHARED_TEXT", "contentText": "extra"}, headers=h)
        assert r.status_code == 201
        eid = r.json()["id"]

        r = api.get(f"{API}/awaits/{aid}/evidence", headers=h)
        assert r.status_code == 200 and len(r.json()) >= 1

        # Delete evidence
        r = api.delete(f"{API}/evidence/{eid}", headers=h)
        assert r.status_code == 200

        # Delete await (soft)
        r = api.delete(f"{API}/awaits/{aid}", headers=h)
        assert r.status_code == 200
        r = api.get(f"{API}/awaits/{aid}", headers=h)
        assert r.status_code == 404


# --------------------------------------------------------------------- Free limit
class TestFreeLimit:
    def test_11th_returns_402(self, api):
        email = f"limit_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={"name": "Limit", "email": email, "password": "password123"})
        assert r.status_code in (200, 201)
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        # Fresh user has 5 active seeded. Need 5 more to hit 10 active.
        for i in range(5):
            r = api.post(f"{API}/awaits", json={"ownerName": f"P{i}", "commitment": "do thing"}, headers=h)
            assert r.status_code == 201, r.text

        # 11th active should return 402 FREE_LIMIT
        r = api.post(f"{API}/awaits", json={"ownerName": "Overflow", "commitment": "too many"}, headers=h)
        assert r.status_code == 402, r.text
        d = r.json().get("detail")
        code = d.get("code") if isinstance(d, dict) else None
        assert code == "FREE_LIMIT", f"Expected FREE_LIMIT, got {d}"


# --------------------------------------------------------------------- Stats/reminders/upgrade
class TestMisc:
    def test_stats(self, api, fresh_user):
        r = api.get(f"{API}/stats", headers=fresh_user["headers"])
        assert r.status_code == 200
        s = r.json()
        assert s["total"] == 7 and s["done"] == 2 and s["waiting"] == 5

    def test_reminders_tick(self, api, fresh_user):
        r = api.post(f"{API}/reminders/tick", headers=fresh_user["headers"])
        assert r.status_code == 200
        assert "fired" in r.json() and isinstance(r.json()["fired"], list)

    def test_plan_upgrade_removed(self, api, fresh_user):
        """POST /plan/upgrade should have been removed (404/405)."""
        r = api.post(f"{API}/plan/upgrade", headers=fresh_user["headers"])
        assert r.status_code in (404, 405), f"Expected 404/405, got {r.status_code}: {r.text}"

    def test_plan_restore_removed(self, api, fresh_user):
        r = api.post(f"{API}/plan/restore", headers=fresh_user["headers"])
        assert r.status_code in (404, 405), f"Expected 404/405, got {r.status_code}: {r.text}"


# --------------------------------------------------------------------- X-Plan header (RevenueCat)
class TestXPlanHeader:
    def test_me_plan_free_without_header(self, api, fresh_user):
        r = api.get(f"{API}/auth/me", headers=fresh_user["headers"])
        assert r.status_code == 200
        assert r.json().get("plan") == "FREE"

    def test_me_plan_pro_with_header(self, api, fresh_user):
        h = dict(fresh_user["headers"])
        h["X-Plan"] = "PRO"
        r = api.get(f"{API}/auth/me", headers=h)
        assert r.status_code == 200
        assert r.json().get("plan") == "PRO"

    def test_awaits_pro_returns_old_done_items(self, api, fresh_user):
        """With X-Plan: PRO, DONE items older than 30 days should be returned (no cutoff)."""
        h = dict(fresh_user["headers"])
        h["X-Plan"] = "PRO"
        r = api.get(f"{API}/awaits?state=DONE", headers=h)
        assert r.status_code == 200
        docs = r.json()
        # Seeded DONE items are 38-44 days old; PRO must see them.
        assert len(docs) >= 2, f"PRO should see >=2 seeded DONE items, got {len(docs)}"

    def test_awaits_free_hides_old_done_items(self, api, fresh_user):
        """Without X-Plan header, 30-day cutoff applies to DONE items."""
        r = api.get(f"{API}/awaits?state=DONE", headers=fresh_user["headers"])
        assert r.status_code == 200
        docs = r.json()
        # Any DONE returned to FREE must have completedAt within 30 days.
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        for d in docs:
            c = d.get("completedAt")
            if not c:
                continue
            # Parse ISO
            try:
                dt = datetime.fromisoformat(c.replace("Z", "+00:00"))
            except Exception:
                continue
            assert dt >= cutoff, f"FREE returned DONE older than 30d: {d.get('ownerName')} completedAt={c}"

    def test_free_limit_bypassed_with_pro_header(self, api):
        """Creating 11th active Await succeeds when X-Plan: PRO is sent."""
        email = f"prolimit_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={"name": "ProLimit", "email": email, "password": "password123"})
        assert r.status_code in (200, 201)
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "X-Plan": "PRO"}

        # Fresh user has 5 seeded active; add 5 to reach 10, then attempt the 11th.
        for i in range(5):
            r = api.post(f"{API}/awaits", json={"ownerName": f"P{i}", "commitment": "do thing"}, headers=h)
            assert r.status_code == 201, r.text
        r = api.post(f"{API}/awaits", json={"ownerName": "Eleven", "commitment": "make it pass"}, headers=h)
        assert r.status_code == 201, f"PRO should allow 11th active, got {r.status_code}: {r.text}"


# --------------------------------------------------------------------- AI
class TestAI:
    @pytest.fixture(scope="class")
    def user(self, api):
        email = f"ai_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{API}/auth/register", json={"name": "Ai", "email": email, "password": "password123"})
        assert r.status_code in (200, 201)
        tok = r.json()["session_token"]
        return {"h": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}

    def test_extract_sameer_match(self, api, user):
        r = api.post(f"{API}/ai/extract", json={"text": "Sameer: Sorry, I'll send it Monday.", "source_type": "SHARED_TEXT"}, headers=user["h"], timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True, f"Expected ok=True, got {d}"
        assert d["extraction"]["who"] and "sameer" in d["extraction"]["who"].lower()
        # Match against seeded Sameer with relationshipConfidence >= 0.85
        assert d.get("match"), f"Expected match, got {d}"
        assert d["match"]["candidate"]["ownerName"] == "Sameer"
        assert d["match"]["relationshipConfidence"] >= 0.85, f"got {d['match']['relationshipConfidence']}"

    def test_extract_amazon_completion(self, api, user):
        r = api.post(f"{API}/ai/extract", json={"text": "Amazon: Your refund of ₹3,499 has been processed.", "source_type": "SHARED_TEXT"}, headers=user["h"], timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        # Completion signal either in extraction or high completionSignalConfidence in match
        completion = (d.get("extraction") or {}).get("completion_signal") or ((d.get("match") or {}).get("completionSignalConfidence") or 0) >= 0.6
        assert completion, f"Expected completion signal, got {d}"

    def test_extract_garbage(self, api, user):
        r = api.post(f"{API}/ai/extract", json={"text": "asdf qwerty", "source_type": "SHARED_TEXT"}, headers=user["h"], timeout=60)
        assert r.status_code == 200
        assert r.json()["ok"] is False

    def test_followup_draft(self, api, user):
        # Get one open await
        r = api.get(f"{API}/awaits?include_done=false", headers=user["h"])
        aid = r.json()[0]["id"]
        r = api.post(f"{API}/awaits/{aid}/followup-draft", json={"tone": "Firm"}, headers=user["h"], timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["draft"], str) and len(d["draft"]) > 20
