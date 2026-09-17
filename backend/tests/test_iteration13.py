"""
Iteration 13 backend tests — Bulk Snooze + Bulk Reminder Restore.

Covers:
  1) POST /api/awaits/bulk-snooze  reschedules only the caller's own items.
     Response = {count, until}; each listed item's nextReminderAt becomes ~now+3d,
     attentionState=NORMAL, ignoredReminderCount=0.
  2) Passing an id owned by another user must NOT be affected and must NOT be counted.
  3) POST /api/awaits/bulk-reminder-restore restores each item's nextReminderAt to
     the given value; returns {count}. Round-trip: create 2 -> bulk-snooze ->
     bulk-reminder-restore -> nextReminderAt reverted.
"""
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta


BASE = None  # bound in conftest via fixture


def _iso_in(days: int, hour: int = 12) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def _parse(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _create(api, base, headers, name="TEST_BulkOwner", commitment="bulk test", days_out=2):
    r = api.post(f"{base}/awaits", headers=headers, json={
        "ownerName": name, "commitment": commitment, "expectedAt": _iso_in(days_out, 10),
        "reminderLeadDays": 0,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


# -------- Fixtures for a second, isolated user (for owner-scoping test) --------

@pytest.fixture(scope="module")
def bob(api, base):
    email = f"test_bob_{uuid.uuid4().hex[:8]}@example.com"
    r = api.post(f"{base}/auth/register", json={"name": "TEST_Bob", "email": email, "password": "password123"})
    assert r.status_code in (200, 201), r.text
    tok = r.json()["session_token"]
    return {"email": email, "token": tok,
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


class TestBulkSnooze:

    def test_bulk_snooze_reschedules_owned_items(self, api, base, alex_h):
        """Create 3 awaits, bulk-snooze them by days=3, verify counts + nextReminderAt shift."""
        items = [_create(api, base, alex_h, commitment=f"bulk-item-{i}") for i in range(3)]
        ids = [it["id"] for it in items]
        originals = {it["id"]: it["nextReminderAt"] for it in items}
        try:
            r = api.post(f"{base}/awaits/bulk-snooze", headers=alex_h, json={"ids": ids, "days": 3})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["count"] == 3, f"expected count=3, got {body}"
            assert "until" in body and body["until"], body
            until_dt = _parse(body["until"])
            # until should be ~ now + 3 days (allow +/- 2 min)
            expected_dt = datetime.now(timezone.utc) + timedelta(days=3)
            delta = abs((until_dt - expected_dt).total_seconds())
            assert delta < 120, f"until={until_dt} not close to now+3d ({expected_dt})"

            # Verify each item persisted
            for aid in ids:
                g = api.get(f"{base}/awaits/{aid}", headers=alex_h)
                assert g.status_code == 200
                gb = g.json()
                assert gb["nextReminderAt"] is not None
                nr = _parse(gb["nextReminderAt"])
                assert abs((nr - until_dt).total_seconds()) < 5, \
                    f"nextReminderAt {nr} != until {until_dt} for {aid}"
                assert gb["attentionState"] == "NORMAL"
                assert gb["ignoredReminderCount"] == 0
                # And clearly shifted from the pre-snooze value
                assert gb["nextReminderAt"] != originals[aid]
        finally:
            for aid in ids:
                api.delete(f"{base}/awaits/{aid}", headers=alex_h)

    def test_bulk_snooze_owner_scoping(self, api, base, alex_h, bob):
        """Bob's ids must not be affected when Alex posts them; count reflects only owned."""
        alex_item = _create(api, base, alex_h, commitment="alex owns this")
        # Create one owned by Bob
        rb = api.post(f"{base}/awaits", headers=bob["headers"], json={
            "ownerName": "TEST_BobsOwner", "commitment": "bob owns this",
            "expectedAt": _iso_in(2, 9), "reminderLeadDays": 0,
        })
        assert rb.status_code in (200, 201), rb.text
        bob_item = rb.json()
        bob_original_next = bob_item["nextReminderAt"]
        try:
            # Alex sends BOTH ids; only her own should be updated
            r = api.post(f"{base}/awaits/bulk-snooze", headers=alex_h,
                         json={"ids": [alex_item["id"], bob_item["id"]], "days": 3})
            assert r.status_code == 200, r.text
            assert r.json()["count"] == 1, f"expected count=1 (owner-scoped), got {r.json()}"

            # Bob's item must be unchanged
            gb = api.get(f"{base}/awaits/{bob_item['id']}", headers=bob["headers"])
            assert gb.status_code == 200
            assert gb.json()["nextReminderAt"] == bob_original_next, \
                "Bob's nextReminderAt was mutated by Alex's bulk-snooze!"

            # Alex's item WAS updated
            ga = api.get(f"{base}/awaits/{alex_item['id']}", headers=alex_h)
            assert ga.status_code == 200
            assert ga.json()["nextReminderAt"] != alex_item["nextReminderAt"]
        finally:
            api.delete(f"{base}/awaits/{alex_item['id']}", headers=alex_h)
            api.delete(f"{base}/awaits/{bob_item['id']}", headers=bob["headers"])

    def test_bulk_snooze_empty_ids(self, api, base, alex_h):
        r = api.post(f"{base}/awaits/bulk-snooze", headers=alex_h, json={"ids": [], "days": 3})
        assert r.status_code == 200
        assert r.json()["count"] == 0


class TestBulkReminderRestore:

    def test_bulk_snooze_then_restore_reverts(self, api, base, alex_h):
        """Create 2 awaits, capture originals, bulk-snooze, then bulk-restore -> reverted."""
        items = [_create(api, base, alex_h, commitment=f"restore-item-{i}") for i in range(2)]
        payload_ids = [it["id"] for it in items]
        originals = [{"id": it["id"], "nextReminderAt": it["nextReminderAt"],
                       "ignoredReminderCount": it.get("ignoredReminderCount", 0)} for it in items]
        try:
            # Bulk snooze
            s = api.post(f"{base}/awaits/bulk-snooze", headers=alex_h,
                         json={"ids": payload_ids, "days": 3})
            assert s.status_code == 200
            assert s.json()["count"] == 2

            # Restore
            rr = api.post(f"{base}/awaits/bulk-reminder-restore", headers=alex_h,
                          json={"items": originals})
            assert rr.status_code == 200, rr.text
            assert rr.json()["count"] == 2

            # Verify each item's nextReminderAt is back to the original
            for orig in originals:
                g = api.get(f"{base}/awaits/{orig['id']}", headers=alex_h)
                assert g.status_code == 200
                got = g.json()["nextReminderAt"]
                assert _parse(got) == _parse(orig["nextReminderAt"]), \
                    f"nextReminderAt not restored: {got} != {orig['nextReminderAt']}"
        finally:
            for aid in payload_ids:
                api.delete(f"{base}/awaits/{aid}", headers=alex_h)

    def test_bulk_restore_owner_scoped(self, api, base, alex_h, bob):
        """Passing Bob's id in bulk-restore under Alex must NOT mutate Bob's data."""
        # Create Bob's item and snooze it as Bob so bob_original != current
        rb = api.post(f"{base}/awaits", headers=bob["headers"], json={
            "ownerName": "TEST_BobsRestoreOwner", "commitment": "bob restore test",
            "expectedAt": _iso_in(2, 9), "reminderLeadDays": 0,
        })
        assert rb.status_code in (200, 201)
        bob_item = rb.json()
        # Snooze as bob to change its current state
        s = api.post(f"{base}/awaits/{bob_item['id']}/snooze",
                     headers=bob["headers"], json={"days": 5})
        assert s.status_code == 200
        current_bob_next = s.json()["nextReminderAt"]

        try:
            # Alex tries to restore Bob's item to a fake old date
            fake_old = _iso_in(-30, 12)
            r = api.post(f"{base}/awaits/bulk-reminder-restore", headers=alex_h,
                         json={"items": [{"id": bob_item["id"], "nextReminderAt": fake_old,
                                            "ignoredReminderCount": 0}]})
            assert r.status_code == 200
            assert r.json()["count"] == 0, "Alex should NOT be able to restore Bob's item"

            # Bob's item must be unchanged
            g = api.get(f"{base}/awaits/{bob_item['id']}", headers=bob["headers"])
            assert g.status_code == 200
            assert g.json()["nextReminderAt"] == current_bob_next, \
                "Bob's item was mutated by Alex's bulk-reminder-restore!"
        finally:
            api.delete(f"{base}/awaits/{bob_item['id']}", headers=bob["headers"])

    def test_bulk_restore_empty(self, api, base, alex_h):
        r = api.post(f"{base}/awaits/bulk-reminder-restore", headers=alex_h, json={"items": []})
        assert r.status_code == 200
        assert r.json()["count"] == 0


# -------- Auth guard --------

class TestBulkAuthGuard:

    def test_bulk_snooze_requires_auth(self, api, base):
        r = api.post(f"{base}/awaits/bulk-snooze", json={"ids": ["fake"], "days": 3})
        assert r.status_code in (401, 403), r.text

    def test_bulk_restore_requires_auth(self, api, base):
        r = api.post(f"{base}/awaits/bulk-reminder-restore",
                     json={"items": [{"id": "fake", "nextReminderAt": None, "ignoredReminderCount": 0}]})
        assert r.status_code in (401, 403), r.text
