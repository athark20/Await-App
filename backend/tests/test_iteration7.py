"""Iteration 7 backend tests: Category Insights + Recurring Templates."""
import re
from datetime import datetime, timezone, timedelta


# ---------------------------------------------------------------- Category Insights
class TestCategoryInsights:
    def test_stats_categories_shape_and_alex_slipRates(self, api, base, alex_h):
        r = api.get(f"{base}/stats/categories", headers=alex_h)
        assert r.status_code == 200, r.text
        data = r.json()

        # Shape checks
        assert "categories" in data and isinstance(data["categories"], list)
        assert "tips" in data and isinstance(data["tips"], list)
        assert isinstance(data["currency"], str) and len(data["currency"]) == 3

        cats = data["categories"]
        assert len(cats) >= 2

        # Each row has required keys
        required = {"category", "total", "open", "overdue", "judged", "slipped",
                    "slipRate", "avgDaysLate", "worstOwner", "owed"}
        for c in cats:
            assert required.issubset(set(c.keys())), f"Missing keys: {required - set(c.keys())}"

        # Sorted by slipRate desc (None treated as 0)
        rates = [(c["slipRate"] or 0) for c in cats]
        assert rates == sorted(rates, reverse=True), f"Not sorted desc: {rates}"

        # For alex, REFUND and DELIVERY should have slipRate 1.0 with worstOwner 'Amazon'
        by_cat = {c["category"]: c for c in cats}
        for k in ("REFUND", "DELIVERY"):
            assert k in by_cat, f"Missing {k} category for alex"
            assert by_cat[k]["slipRate"] == 1.0, f"{k} slipRate: {by_cat[k]['slipRate']}"
            assert by_cat[k]["worstOwner"] == "Amazon", f"{k} worstOwner: {by_cat[k]['worstOwner']}"

    def test_stats_categories_tips_content(self, api, base, alex_h):
        r = api.get(f"{base}/stats/categories", headers=alex_h)
        assert r.status_code == 200
        data = r.json()
        tips = data["tips"]
        assert len(tips) >= 1
        # Tips are non-empty strings
        for t in tips:
            assert isinstance(t, str) and len(t) > 0
        # Tips mention a category label and 'Chase'
        joined = " ".join(tips)
        labels = ["Deliveries", "Refunds", "Documents", "Appointments", "Payments", "Other"]
        assert any(lbl in joined for lbl in labels), f"No category label in tips: {tips}"
        assert "Chase" in joined, f"'Chase' missing from tips: {tips}"


# ---------------------------------------------------------------- Recurring Templates
def _next_monday_9utc(after: datetime) -> datetime:
    d = after.date() + timedelta(days=1)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return datetime(d.year, d.month, d.day, 9, tzinfo=timezone.utc)


def _iso(s: str) -> datetime:
    # Accept both '...Z' and '+00:00' ISO strings
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


class TestTemplatesCRUD:
    created_tpl_id = None
    created_await_id = None

    def test_01_create_weekly_template(self, api, base, alex_h):
        payload = {
            "title": "Weekly report",
            "ownerName": "Team",
            "commitment": "Send status report",
            "category": "DOCUMENT",
            "every": "week",
            "weekday": 0,  # Monday
            "expectedAfterDays": 2,
        }
        r = api.post(f"{base}/templates", headers=alex_h, json=payload)
        assert r.status_code in (200, 201), r.text
        t = r.json()
        assert t.get("id"), t
        assert t.get("active") is True
        assert int(t.get("runs") or 0) == 0

        # nextRunAt = next Monday 09:00Z strictly in the future
        nxt = _iso(t["nextRunAt"])
        now_utc = datetime.now(timezone.utc)
        assert nxt > now_utc, f"nextRunAt not in future: {nxt} <= {now_utc}"
        assert nxt.weekday() == 0, f"Not a Monday: {nxt}"
        assert nxt.hour == 9 and nxt.minute == 0, f"Not 09:00 UTC: {nxt}"

        # Store for downstream tests
        TestTemplatesCRUD.created_tpl_id = t["id"]

    def test_02_list_includes_created(self, api, base, alex_h):
        assert TestTemplatesCRUD.created_tpl_id
        r = api.get(f"{base}/templates", headers=alex_h)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTemplatesCRUD.created_tpl_id in ids

    def test_03_patch_to_monthly_dom15(self, api, base, alex_h):
        tid = TestTemplatesCRUD.created_tpl_id
        assert tid
        r = api.patch(f"{base}/templates/{tid}", headers=alex_h,
                      json={"every": "month", "dayOfMonth": 15})
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["every"] == "month" and t["dayOfMonth"] == 15
        nxt = _iso(t["nextRunAt"])
        now_utc = datetime.now(timezone.utc)
        assert nxt > now_utc
        assert nxt.day == 15, f"Not the 15th: {nxt}"
        assert nxt.hour == 9 and nxt.minute == 0

    def test_04_patch_active_false(self, api, base, alex_h):
        tid = TestTemplatesCRUD.created_tpl_id
        r = api.patch(f"{base}/templates/{tid}", headers=alex_h, json={"active": False})
        assert r.status_code == 200
        assert r.json()["active"] is False
        # Reactivate for run test
        r2 = api.patch(f"{base}/templates/{tid}", headers=alex_h, json={"active": True})
        assert r2.status_code == 200
        assert r2.json()["active"] is True

    def test_05_run_template_manual(self, api, base, alex_h):
        tid = TestTemplatesCRUD.created_tpl_id
        r = api.post(f"{base}/templates/{tid}/run", headers=alex_h)
        assert r.status_code in (200, 201), r.text
        aw = r.json()
        assert aw.get("ownerName") == "Team"
        assert aw.get("templateId") == tid
        assert aw.get("sourceAppLabel") == "Recurring"

        exp = _iso(aw["expectedAt"])
        target = datetime.now(timezone.utc) + timedelta(days=2)
        # Allow +/- 2 minutes tolerance
        assert abs((exp - target).total_seconds()) < 120, f"expectedAt off: {exp} vs {target}"

        TestTemplatesCRUD.created_await_id = aw["id"]

        # Template runs incremented + nextRunAt still future
        r2 = api.get(f"{base}/templates", headers=alex_h)
        tpl = next((t for t in r2.json() if t["id"] == tid), None)
        assert tpl is not None
        assert int(tpl["runs"]) == 1, f"runs: {tpl['runs']}"
        assert _iso(tpl["nextRunAt"]) > datetime.now(timezone.utc)

    def test_06_templates_tick_nothing_due(self, api, base, alex_h):
        r = api.post(f"{base}/templates/tick", headers=alex_h)
        assert r.status_code == 200
        assert r.json() == {"created": []}

    def test_07_patch_unknown_404(self, api, base, alex_h):
        r = api.patch(f"{base}/templates/tpl_does_not_exist", headers=alex_h,
                      json={"active": False})
        assert r.status_code == 404

    def test_08_delete_template(self, api, base, alex_h):
        tid = TestTemplatesCRUD.created_tpl_id
        r = api.delete(f"{base}/templates/{tid}", headers=alex_h)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        # List no longer has it
        r2 = api.get(f"{base}/templates", headers=alex_h)
        ids = [t["id"] for t in r2.json()]
        assert tid not in ids

    def test_09_cleanup_created_await(self, api, base, alex_h):
        aid = TestTemplatesCRUD.created_await_id
        if not aid:
            return
        r = api.delete(f"{base}/awaits/{aid}", headers=alex_h)
        assert r.status_code == 200, r.text

    def test_10_existing_monthly_rent_template_still_present(self, api, base, alex_h):
        """Alex's seeded 'Monthly rent receipt' template should NOT have been touched."""
        r = api.get(f"{base}/templates", headers=alex_h)
        assert r.status_code == 200
        titles = [t["title"] for t in r.json()]
        assert "Monthly rent receipt" in titles, f"Seed template missing: {titles}"
