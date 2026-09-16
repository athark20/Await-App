# Await — Product Requirements Document

## Original problem statement (summary)
Production-quality Android-first Expo app "Await" that remembers commitments others owe the user (refunds, quotations, deliveries, documents, appointments). Core model: workflow state MY_TURN / THEIR_TURN / DONE with attention overlay NORMAL / OVERDUE / NEEDS_REVIEW / POSSIBLE_RESOLUTION. Supplied screenshots are the visual source of truth; final logo = open electric-blue loop + amber dot. Bottom nav exactly Home / Add / Search / Profile. Core V1 feature: Share-to-Await (Android share target) → preview → AI extract → confirm; existing-Await matching (update / possible resolution) with no silent save and no auto-close. No connected apps, no inbox reading, no auto-sending.

## User choices
- Full product (frontend + real FastAPI/MongoDB backend) in first delivery
- Real auth: Emergent-managed Google + email/password
- AI: GPT-5.4 primary (multimodal), Gemini 3.1 Pro (fallback, PDF, audio transcription) via Emergent LLM key
- Share target: Android intent filters configured + simulated incoming-share entry for Expo Go / web
- Default theme: System. UI should feel like Samsung One UI (large rounded cards, calm density)

## Architecture
- `backend/server.py` — FastAPI, Motor/Mongo. Collections: users, user_sessions, awaits (soft delete), events (timeline), evidence (soft delete). Session-token auth (Bearer). Emergent Google session exchange. Auto-seed of demo data per new user.
- Endpoints (all `/api`): auth (register/login/session/guest/me/logout/forgot/account), awaits CRUD + state/reopen/snooze/followup-sent/apply-update/resolution/flag-resolution/events/evidence, evidence delete, stats, reminders/tick (anti-spam → NEEDS_REVIEW after 3 ignored), plan upgrade/restore, data/clear, ai/extract (extraction + open-Await matching), awaits/{id}/followup-draft, ai/transcribe.
- Free plan enforced server-side: 10 active Awaits (402 FREE_LIMIT), 5 AI extractions/mo, 3 follow-up drafts/mo, 30-day done history.
- `frontend/src/theme.ts` — brand tokens light/dark (identical geometry), platform-independent scheme override.
- `frontend/src/components` — Logo (open loop + amber dot), ui (Button, Pill, IconBox, Card, ScreenHeader, Field, ListRow, Group, Chips, StateSelector, EmptyState, Banner), AwaitCard, Sheet (bottom sheet), Toast, AwaitForm, common (FreeLimitSheet, OfflineBanner).
- Routes: (auth)/welcome|login|register|forgot; onboarding/notifications; (tabs)/index|add|search|profile; item/[id] (Details/Updates/Evidence); followup/[id]; capture/share|confirm|match|manual|screenshot|voice; needs-review; history; stats; settings/notifications|preferences|privacy|help|upgrade.
- Notifications: expo-notifications, 3 Android channels, action category Follow Up / Mark Done / Later, local scheduling with quiet hours.
- `app.json`: scheme `await`, Android SEND / SEND_MULTIPLE intent filters (text/*, image/*, pdf, doc/docx, csv, xls/xlsx), permissions & iOS usage strings.

## Implemented (2026-06)
- All screens listed above, light + dark, seeded demo data (Amazon refund overdue, Sameer due today, Rahul, Plumber, Insurance overdue, 2 done)
- Full Await lifecycle, timeline, evidence view/add/delete, delete confirmation, reopen with next-owner prompt
- Share-to-Await flow (simulated sources: message, date-change update, resolution update, URL, screenshots, documents) → preview → analyze → AI Extract & Confirm / failure state / Related Found (65–84%) / Update Found (≥85%) / Likely Resolved (never auto-closes)
- Screenshot capture (gallery/camera w/ permission handling), voice capture (expo-audio → Gemini transcription), manual add
- AI follow-up drafts w/ tone, copy/open app, "I sent it" → next check-in
- Needs Review screen, History, My Progress (donut + category breakdown), Settings (Notifications, Preferences, Privacy & Security, Help & Support, Upgrade to Pro), Free Limit Reached sheet, offline banner
- Testing: backend 18/20 (fixed seed cutoff bug), frontend flows verified

## Backlog
- P0: Native share-intent bridge (expo-share-intent config plugin) so real ACTION_SEND payloads land in `await://share` (requires production build; intent filters already declared)
- P0: Real subscription (Emergent-managed RevenueCat) replacing mock upgrade
- P1: Background reminder engine (expo-background-task calling /reminders/tick), daily summary notification
- P1: Native date picker for Expected by; app lock via expo-local-authentication
- P2: DOCX/XLSX text extraction server-side; offline write queue; multi-device sync polish
- P2: Password reset email (Resend)

## Notes
- Google login, native share, notifications with actions and voice need a real device/build; web preview covers everything else.
