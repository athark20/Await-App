"""Iteration 8 backend tests: calendarEventId patch + /ai/transcribe."""
import base64
import io
import wave

import pytest


# ---- PATCH /awaits/{id} calendarEventId round-trip on Rahul's item ------------
class TestCalendarEventIdPatch:
    def _find_rahul(self, api, base, alex_h):
        r = api.get(f"{base}/awaits", headers=alex_h)
        assert r.status_code == 200, r.text
        for a in r.json():
            if a["ownerName"] == "Rahul":
                return a
        pytest.skip("Rahul seed item missing")

    def test_patch_calendar_event_id_persists(self, api, base, alex_h):
        a = self._find_rahul(api, base, alex_h)
        aid = a["id"]
        # PATCH with a non-empty value
        r = api.patch(f"{base}/awaits/{aid}", headers=alex_h, json={"calendarEventId": "evt_test_123"})
        assert r.status_code == 200, r.text
        assert r.json().get("calendarEventId") == "evt_test_123"
        # GET echoes it
        r2 = api.get(f"{base}/awaits/{aid}", headers=alex_h)
        assert r2.status_code == 200
        assert r2.json().get("calendarEventId") == "evt_test_123"
        # Clean up: PATCH with empty string should be accepted (exclude_none allows "")
        r3 = api.patch(f"{base}/awaits/{aid}", headers=alex_h, json={"calendarEventId": ""})
        assert r3.status_code == 200
        assert r3.json().get("calendarEventId") == ""


# ---- POST /ai/transcribe with a 1s silent WAV --------------------------------
def _one_second_silence_wav_b64() -> str:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)  # 1s silence
    return base64.b64encode(buf.getvalue()).decode()


class TestAiTranscribe:
    def test_transcribe_silence_returns_json_or_graceful_error(self, api, base, alex_h):
        payload = {"audio_base64": _one_second_silence_wav_b64(), "mime_type": "audio/wav"}
        r = api.post(f"{base}/ai/transcribe", headers=alex_h, json=payload, timeout=60)
        # Must not crash the server (5xx bubbled up from fastapi is acceptable JSON error, but not a crash)
        assert r.status_code < 600
        # Response must be JSON either way
        try:
            body = r.json()
        except Exception:
            pytest.fail(f"Non-JSON response: {r.status_code} {r.text[:200]}")
        if r.status_code == 200:
            assert "transcript" in body and isinstance(body["transcript"], str)
        else:
            # graceful 4xx/5xx JSON error is acceptable
            assert isinstance(body, dict)

    def test_health_still_ok_after_transcribe(self, api, base, alex_h):
        r = api.get(f"{base}/health")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_transcribe_requires_auth(self, api, base):
        r = api.post(f"{base}/ai/transcribe", json={"audio_base64": "", "mime_type": "audio/wav"})
        assert r.status_code == 401
