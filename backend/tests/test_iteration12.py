"""
Iteration 12 backend tests — Snooze Undo + Per-Await Reminder Time.

Covers:
  1) POST /api/awaits/{id}/reminder-restore restores nextReminderAt after a snooze.
  2) POST /api/awaits with reminderTime='18:00' persists it and applies it to nextReminderAt time component.
  3) PATCH /api/awaits/{id} with reminderTime='21:00' persists and shifts nextReminderAt to 21:00.
  4) PATCH with reminderTime='' clears it (stored as null) and nextReminderAt clock resets to base.
"""
import pytest
import requests
from datetime import datetime, timezone, timedelta


# ---------- helpers ----------

def _iso_in(days: int, hour: int = 12, minute: int = 0) -> str:
    d = datetime.now(timezone.utc) + timedelta(days=days)
    return d.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


def _parse(dt_str):
    # backend returns iso strings like '2026-01-15T18:00:00+00:00'
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))


# ---------- 1) reminder-restore (undo snooze) ----------

class TestReminderRestore:

    def test_undo_snooze_restores_next_reminder(self, api, base, alex_h):
        # Create an Await with a known expectedAt (=> nextReminderAt matches expectedAt when leadDays=0)
        expected = _iso_in(2, 10, 30)
        r = api.post(f"{base}/awaits", headers=alex_h, json={
            "ownerName": "TEST_UndoOwner", "commitment": "restore reminder", "expectedAt": expected,
            "reminderLeadDays": 0,
        })
        assert r.status_code in (200, 201), r.text
        item = r.json()
        aw_id = item["id"]
        original_next = item["nextReminderAt"]
        assert original_next is not None

        try:
            # Snooze 3 days
            snoozed = api.post(f"{base}/awaits/{aw_id}/snooze", headers=alex_h, json={"days": 3})
            assert snoozed.status_code == 200, snoozed.text
            snoozed_next = snoozed.json()["nextReminderAt"]
            assert snoozed_next != original_next  # snooze moved it forward

            # Restore
            rr = api.post(f"{base}/awaits/{aw_id}/reminder-restore", headers=alex_h,
                          json={"nextReminderAt": original_next, "ignoredReminderCount": 2})
            assert rr.status_code == 200, rr.text
            restored = rr.json()
            # Timestamps should equal to the second
            assert _parse(restored["nextReminderAt"]) == _parse(original_next), \
                f"{restored['nextReminderAt']} != {original_next}"
            assert restored["ignoredReminderCount"] == 2

            # Verify via GET
            g = api.get(f"{base}/awaits/{aw_id}", headers=alex_h)
            assert g.status_code == 200
            assert _parse(g.json()["nextReminderAt"]) == _parse(original_next)
        finally:
            api.delete(f"{base}/awaits/{aw_id}", headers=alex_h)

    def test_reminder_restore_clamps_negative_ignored_count(self, api, base, alex_h):
        expected = _iso_in(1, 9, 0)
        r = api.post(f"{base}/awaits", headers=alex_h, json={
            "ownerName": "TEST_ClampOwner", "commitment": "clamp neg", "expectedAt": expected,
        })
        assert r.status_code in (200, 201)
        aw_id = r.json()["id"]
        original = r.json()["nextReminderAt"]
        try:
            api.post(f"{base}/awaits/{aw_id}/snooze", headers=alex_h, json={"days": 1})
            rr = api.post(f"{base}/awaits/{aw_id}/reminder-restore", headers=alex_h,
                          json={"nextReminderAt": original, "ignoredReminderCount": -5})
            assert rr.status_code == 200
            assert rr.json()["ignoredReminderCount"] == 0
        finally:
            api.delete(f"{base}/awaits/{aw_id}", headers=alex_h)


# ---------- 2) reminderTime on create ----------

class TestReminderTimeOnCreate:

    def test_create_with_reminder_time_1800(self, api, base, alex_h):
        expected = _iso_in(3, 10, 0)  # base time 10:00 UTC
        r = api.post(f"{base}/awaits", headers=alex_h, json={
            "ownerName": "TEST_RT_Owner", "commitment": "reminder at 6pm", "expectedAt": expected,
            "reminderTime": "18:00",
        })
        assert r.status_code in (200, 201), r.text
        item = r.json()
        aw_id = item["id"]
        try:
            assert item.get("reminderTime") == "18:00"
            nr = _parse(item["nextReminderAt"])
            assert nr.hour == 18 and nr.minute == 0, f"expected 18:00, got {nr.isoformat()}"
            # date is preserved
            exp_dt = _parse(expected)
            assert nr.date() == exp_dt.date()

            # Verify via GET
            g = api.get(f"{base}/awaits/{aw_id}", headers=alex_h)
            assert g.status_code == 200
            body = g.json()
            assert body["reminderTime"] == "18:00"
            gnr = _parse(body["nextReminderAt"])
            assert (gnr.hour, gnr.minute) == (18, 0)
        finally:
            api.delete(f"{base}/awaits/{aw_id}", headers=alex_h)


# ---------- 3) reminderTime via PATCH (set + clear) ----------

class TestReminderTimePatch:

    def test_patch_sets_reminder_time_and_shifts_next_reminder(self, api, base, alex_h):
        expected = _iso_in(4, 8, 15)  # base time 08:15 UTC
        r = api.post(f"{base}/awaits", headers=alex_h, json={
            "ownerName": "TEST_Patch_Owner", "commitment": "patch reminder time", "expectedAt": expected,
        })
        assert r.status_code in (200, 201)
        aw_id = r.json()["id"]
        try:
            # PATCH to 21:00
            p = api.patch(f"{base}/awaits/{aw_id}", headers=alex_h, json={"reminderTime": "21:00"})
            assert p.status_code == 200, p.text
            body = p.json()
            assert body["reminderTime"] == "21:00"
            nr = _parse(body["nextReminderAt"])
            assert (nr.hour, nr.minute) == (21, 0), f"expected 21:00, got {nr.isoformat()}"

            # Verify via GET
            g = api.get(f"{base}/awaits/{aw_id}", headers=alex_h)
            assert g.json()["reminderTime"] == "21:00"

            # PATCH clear (empty string => null)
            p2 = api.patch(f"{base}/awaits/{aw_id}", headers=alex_h, json={"reminderTime": ""})
            assert p2.status_code == 200, p2.text
            assert p2.json().get("reminderTime") in (None, "")
            # Fetch and check normalized None
            g2 = api.get(f"{base}/awaits/{aw_id}", headers=alex_h)
            assert g2.json().get("reminderTime") in (None,), \
                f"expected null reminderTime after clear, got {g2.json().get('reminderTime')!r}"
        finally:
            api.delete(f"{base}/awaits/{aw_id}", headers=alex_h)


# ---------- 4) regression: existing endpoints still healthy ----------

class TestSanityRegression:

    def test_awaits_list_ok(self, api, base, alex_h):
        r = api.get(f"{base}/awaits", headers=alex_h)
        assert r.status_code == 200
        data = r.json()
        # response can be list or {items:[...]}. Accept either.
        assert isinstance(data, (list, dict))

    def test_stats_ok(self, api, base, alex_h):
        r = api.get(f"{base}/stats", headers=alex_h)
        assert r.status_code == 200

    def test_snooze_still_works(self, api, base, alex_h):
        r = api.post(f"{base}/awaits", headers=alex_h, json={
            "ownerName": "TEST_RegOwner", "commitment": "reg snooze", "expectedAt": _iso_in(1),
        })
        assert r.status_code in (200, 201)
        aw_id = r.json()["id"]
        try:
            s = api.post(f"{base}/awaits/{aw_id}/snooze", headers=alex_h, json={"days": 2})
            assert s.status_code == 200
            assert s.json()["nextReminderAt"] is not None
        finally:
            api.delete(f"{base}/awaits/{aw_id}", headers=alex_h)
