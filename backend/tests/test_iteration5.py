"""Iteration 5 backend tests:
- Await Amount field (create/patch with amount & currency)
- Stats / Recap money fields
- /owners list and /owners/{name} detail
"""
import pytest
from conftest import API


# ---------- Amount on Awaits ----------
class TestAwaitAmount:
    def test_create_await_with_amount_and_currency(self, api, alex_h):
        payload = {"ownerName": "TEST_AmountCo", "commitment": "Pay invoice",
                   "amount": 1250.5, "currency": "usd"}
        r = api.post(f"{API}/awaits", json=payload, headers=alex_h)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["amount"] == 1250.5, f"amount {d['amount']}"
        assert d["currency"] == "USD", f"currency {d['currency']} (should be uppercased)"
        aid = d["id"]

        # Verify persisted
        g = api.get(f"{API}/awaits/{aid}", headers=alex_h)
        assert g.status_code == 200
        gd = g.json()
        assert gd["amount"] == 1250.5
        assert gd["currency"] == "USD"

        # PATCH amount to 0 → should null the amount
        p = api.patch(f"{API}/awaits/{aid}", json={"amount": 0}, headers=alex_h)
        assert p.status_code == 200, p.text
        assert p.json()["amount"] is None, f"amount not nulled: {p.json()['amount']}"

        # PATCH amount 999 + currency INR
        p2 = api.patch(f"{API}/awaits/{aid}", json={"amount": 999, "currency": "INR"}, headers=alex_h)
        assert p2.status_code == 200
        d2 = p2.json()
        assert d2["amount"] == 999
        assert d2["currency"] == "INR"

        # Cleanup
        d_r = api.delete(f"{API}/awaits/{aid}", headers=alex_h)
        assert d_r.status_code == 200
        # Verify 404 after delete
        g2 = api.get(f"{API}/awaits/{aid}", headers=alex_h)
        assert g2.status_code == 404


# ---------- Stats / Recap money fields ----------
class TestStatsRecapMoney:
    def test_stats_has_money_fields(self, api, alex_h):
        r = api.get(f"{API}/stats", headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("owed", "recovered", "currency"):
            assert k in d, f"stats missing {k}"
        assert isinstance(d["owed"], (int, float))
        assert isinstance(d["recovered"], (int, float))
        assert isinstance(d["currency"], str) and len(d["currency"]) == 3

        # owed should equal sum of open items' amounts
        aw = api.get(f"{API}/awaits", headers=alex_h).json()
        open_sum = round(sum(float(a.get("amount") or 0) for a in aw if a["state"] != "DONE"), 2)
        assert abs(d["owed"] - open_sum) < 0.01, f"owed {d['owed']} != open_sum {open_sum}"

    def test_recap_weekly_has_money_and_owes_owed(self, api, alex_h):
        r = api.get(f"{API}/recap/weekly", headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "money" in d
        m = d["money"]
        for k in ("owed", "recovered", "currency"):
            assert k in m, f"recap.money missing {k}"
        # owes[*].owed present
        for o in d["owes"]:
            assert "owed" in o, "recap.owes[].owed missing"
            assert isinstance(o["owed"], (int, float))


# ---------- Owners ----------
class TestOwners:
    def test_list_owners_shape_and_sort(self, api, alex_h):
        r = api.get(f"{API}/owners", headers=alex_h)
        assert r.status_code == 200, r.text
        owners = r.json()
        assert isinstance(owners, list) and len(owners) > 0
        expected_keys = {"ownerName", "key", "open", "done", "overdue", "owed", "recovered",
                         "currency", "onTimeRate", "avgDaysLate", "remindersSent",
                         "lastActivityAt", "total", "categories"}
        for o in owners:
            missing = expected_keys - set(o.keys())
            assert not missing, f"owner missing keys {missing}: {o}"
            assert isinstance(o["categories"], list)

        # Sorted: overdue desc, then open desc
        for i in range(len(owners) - 1):
            a, b = owners[i], owners[i + 1]
            assert (a["overdue"], a["open"]) >= (b["overdue"], b["open"]), \
                f"sort violated at {i}: {a['ownerName']}({a['overdue']},{a['open']}) vs {b['ownerName']}({b['overdue']},{b['open']})"

    def test_owner_profile_case_insensitive_amazon(self, api, alex_h):
        r = api.get(f"{API}/owners/amazon", headers=alex_h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ownerName"] == "Amazon", f"ownerName {d['ownerName']}"
        assert "stats" in d
        s = d["stats"]
        # stats contains followups (from owner endpoint) + owner_stats fields
        for k in ("open", "done", "overdue", "owed", "recovered", "currency",
                  "onTimeRate", "avgDaysLate", "remindersSent", "lastActivityAt",
                  "total", "followups"):
            assert k in s, f"owner.stats missing {k}"
        for k in ("open", "done", "recent"):
            assert k in d and isinstance(d[k], list), f"owner.{k} missing/not list"

        # Amazon has both an open (refund) and a done (return pickup) item per seed
        assert len(d["open"]) >= 1
        assert len(d["done"]) >= 1

    def test_owner_profile_unknown_returns_404(self, api, alex_h):
        r = api.get(f"{API}/owners/nobody-xyz", headers=alex_h)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"
