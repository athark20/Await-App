"""Iteration 4 backend tests: /recap/weekly and /awaits/{id}/snooze with `until`."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from conftest import API


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


# --------------------------------------------------------- Weekly Recap ---
class TestWeeklyRecap:
    def test_recap_shape_and_counts_consistent_with_awaits(self, api, alex_h):
        r = api.get(f"{API}/recap/weekly", headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()

        # Shape
        for key in ("weekStart", "weekEnd", "headline", "counts", "resolved", "slipped", "owes"):
            assert key in d, f"missing key {key}"

        counts = d["counts"]
        for key in ("resolved", "slipped", "created", "followups", "open", "overdue"):
            assert key in counts and isinstance(counts[key], int), f"counts.{key} missing/wrong type"

        assert isinstance(d["resolved"], list)
        assert isinstance(d["slipped"], list)
        assert isinstance(d["owes"], list)
        assert len(d["owes"]) <= 3

        for o in d["owes"]:
            for k in ("ownerName", "count", "overdue", "oldestExpectedAt", "items"):
                assert k in o, f"owes[].{k} missing"
            assert isinstance(o["items"], list)

        # Consistency with /awaits open + overdue count
        r2 = api.get(f"{API}/awaits", headers=alex_h)
        assert r2.status_code == 200
        aw = r2.json()
        open_items = [a for a in aw if a["state"] != "DONE"]
        overdue_items = [a for a in open_items if a.get("attentionState") == "OVERDUE"]

        assert counts["open"] == len(open_items), f"open counts mismatch {counts['open']} vs {len(open_items)}"
        assert counts["overdue"] == len(overdue_items), f"overdue counts mismatch {counts['overdue']} vs {len(overdue_items)}"

    def test_resolved_item_appears_in_recap_then_reopen(self, api, alex_h):
        # Pick an open item (not overdue Amazon — pick "Sameer" or first non-Amazon open item)
        r = api.get(f"{API}/awaits", headers=alex_h)
        assert r.status_code == 200
        aw = r.json()
        candidate = None
        for a in aw:
            if a["state"] != "DONE" and "amazon" not in (a.get("ownerName") or "").lower():
                candidate = a
                break
        assert candidate, "no candidate open item found"
        aid = candidate["id"]
        orig_state = candidate["state"]

        # Mark DONE
        r = api.post(f"{API}/awaits/{aid}/state", json={"state": "DONE"}, headers=alex_h)
        assert r.status_code == 200, r.text
        assert r.json()["state"] == "DONE"

        # Recap should include it in resolved
        r = api.get(f"{API}/recap/weekly", headers=alex_h)
        assert r.status_code == 200
        d = r.json()
        ids = [x["id"] for x in d["resolved"]]
        assert aid in ids, f"just-resolved item {aid} not in recap.resolved: {ids}"
        assert d["counts"]["resolved"] >= 1

        # Reopen
        r = api.post(f"{API}/awaits/{aid}/reopen", json={"state": "THEIR_TURN"}, headers=alex_h)
        assert r.status_code == 200, r.text
        assert r.json()["state"] == "THEIR_TURN"

        # Optionally restore original state if it was MY_TURN
        if orig_state == "MY_TURN":
            r = api.post(f"{API}/awaits/{aid}/state", json={"state": "MY_TURN"}, headers=alex_h)
            assert r.status_code == 200


# --------------------------------------------------------- Snooze ---
class TestSnooze:
    def _pick_non_overdue_open(self, api, alex_h):
        r = api.get(f"{API}/awaits", headers=alex_h)
        assert r.status_code == 200
        # Pick an open item whose expectedAt is >= today so computed attentionState becomes NORMAL after snooze
        for a in r.json():
            if a["state"] != "DONE" and a.get("attentionState") != "OVERDUE":
                return a["id"]
        pytest.skip("no non-overdue open item to test snooze")

    def test_snooze_with_until_sets_next_reminder_at_exactly(self, api, alex_h):
        aid = self._pick_non_overdue_open(api, alex_h)

        until_dt = (_now() + timedelta(days=3)).replace(microsecond=0)
        until_iso = _iso(until_dt)

        r = api.post(f"{API}/awaits/{aid}/snooze", json={"until": until_iso, "days": 5}, headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()

        # attentionState NORMAL (computed from expectedAt; non-overdue item stays NORMAL)
        assert d["attentionState"] == "NORMAL", f"expected NORMAL, got {d['attentionState']}"

        # nextReminderAt equals until (allow ms difference)
        nra = d.get("nextReminderAt")
        assert nra, "nextReminderAt not set"
        got = datetime.fromisoformat(nra.replace("Z", "+00:00"))
        assert abs((got - until_dt).total_seconds()) < 2, f"nextReminderAt {got} != until {until_dt}"

    def test_snooze_with_only_days_works(self, api, alex_h):
        aid = self._pick_non_overdue_open(api, alex_h)

        before = _now()
        r = api.post(f"{API}/awaits/{aid}/snooze", json={"days": 1}, headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["attentionState"] == "NORMAL"

        nra = d.get("nextReminderAt")
        assert nra
        got = datetime.fromisoformat(nra.replace("Z", "+00:00"))
        # Should be ~1 day from now (allow 30s slack)
        expected = before + timedelta(days=1)
        diff = abs((got - expected).total_seconds())
        assert diff < 60, f"expected ~1d snooze, got diff={diff}s"
