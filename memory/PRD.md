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

## Implemented (2026-06) — Iteration 2
- RevenueCat (Emergent-managed) Pro subscriptions: `src/revenuecat.tsx` provider, logIn identity binding, Test Store in preview, coded paywall with Restore Purchase; backend honors `X-Plan` header from the verified entitlement (plan endpoints removed). Details in `/app/memory/revenuecat.md`.
- Native Android share bridge: `expo-share-intent` config plugin (ACTION_SEND + SEND_MULTIPLE for text/images/PDF/DOC/CSV/XLS) → `src/share-bridge.tsx` → Share-to-Await flow. Real build only.
- Background reminders: `expo-background-task` + `expo-task-manager` (`src/background.ts`) call `/api/reminders/tick` ~every 6h and fire actionable notifications; also ticks on launch. Real build only.
- Smart Expected-by field: native calendar picker (`@react-native-community/datetimepicker`) + phrase parser `src/dates.ts` ("within 7–10 business days" → latest date, weekdays, "Sep 18", "end of month"…), used in form and AI confirm.
- Welcome motion: self-drawing loop logo + pulsing amber dot (reanimated), Lottie orbit ring, staggered fade-in.

## Backlog (updated)
- P1: Native date picker for iOS inline mode polish; App Lock via expo-local-authentication; daily summary notification
- P2: DOCX/XLSX server-side text extraction; offline write queue; password reset email (Resend)

## Implemented (2026-06) — Iteration 3
- Password reset via emailed 6-digit code (Emergent-managed Resend, `backend/emailer.py` with guardrail gate; `/auth/forgot`, `/auth/reset`; hashed codes, 15-min expiry, rate limits). Two-step Forgot screen.
- Document AI: DOCX/XLSX/CSV text extraction server-side (python-docx/openpyxl) feeding the same extraction pipeline; legacy .doc/.xls → 415 UNSUPPORTED_FILE with "Enter manually" path.
- App Lock: biometric (expo-local-authentication, device passcode fallback) + 4-digit Await PIN (`src/app-lock.tsx`), auto-lock after 1 min in background, PIN setup/change in Privacy & Security.
- Daily 9 AM summary notification (`/api/summary/today` + DAILY trigger), refreshed on app open and by the background task; toggle in Notification settings.
- Login/Welcome polish: card layout, coloured Google (deep blue) / Email (tinted) buttons, inline errors, fade-in motion.

## Implemented (2026-06) — Iteration 4
- Auth visuals: AI-generated Await wallpaper (`assets/images/auth-wallpaper.png`) behind Welcome/Login via `AuthBackdrop` (gradient scrim), official Google "Sign in" button (white, neutral border, full-colour G — `GoogleG.tsx`), single blue CTA (Email), amber accent links. Welcome copy rewritten around the promise-tracking purpose.
- Await Details rebuilt to reference fidelity: hero card (letter tile + category badge, title/owner, status pill, contextual sentence, 4-column Owner/Type/Expected/Alerts meta), Resolution-signal card (confidence `Ring`, evidence quote, 2×2 actions Yes close it / Still waiting / View evidence / Remind later), Needs-review card, quick-action grid, Status, stepper Timeline ("n of n complete", relative times, paused/next-reminder banner), Evidence and Notes cards, ⋮ menu (edit notes / add evidence / delete).
- Smart snooze (`SnoozeSheet.tsx`): Tomorrow morning, After their promised date (or Give them 2 more days when late), At my follow-up check-in, Next Monday, In a week, Pick a date (native calendar). Sends `until` ISO to `/snooze`; reused in item, match and needs-review.
- Weekly recap: `GET /api/recap/weekly` (resolved / slipped / follow-ups / open, top-3 "who owes you most"), `app/recap.tsx` screen, Home Sunday card, Profile row, Sunday 6 PM notification (`notifWeekly` pref + toggle).
- Offline saving (`src/offline.ts` + `api.ts`): GET responses cached (AsyncStorage), Await create/PATCH/state/snooze/reopen queued in an outbox with optimistic local items (`local_*` ids, `pending` flag, "Syncing" label on cards, banner on details), auto-flush when connectivity returns (health poll + AppState), local→server id remapping. Other actions surface an OfflineError.
- Home: summary strip (Overdue / Due today / Waiting / Review); AwaitCard meta row (date · turn · syncing).

## Notes
- Google login, native share, notifications with actions and voice need a real device/build; web preview covers everything else.
