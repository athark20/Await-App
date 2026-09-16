# RevenueCat — integrated (2026-06)
This file is supposed to serve as a memory to you if you have to interact with user's RevenueCat account via integration proxy at any later point in time.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: proj7c9d8868
- apple_app_id: appd94b263da0
- play_app_id: app375a7ec7d8
- entitlement_lookup_key: pro
- offering_lookup_key: default
- bundle_id / package_name: com.emergent.awaitandroid.bbd4jg
- Packages (package -> product_id, current price):
  - $rc_monthly -> proddd2d1175f6   ($9.99 / P1M, trial: none)
  - $rc_annual  -> prod7ba04dfdee   ($79.99 / P1Y, trial: none)
- Dashboard: https://app.revenuecat.com/projects/proj7c9d8868
- Keys live in /app/frontend/.env as EXPO_PUBLIC_REVENUECAT_{TEST,IOS,ANDROID}_API_KEY (never write values here).
- App code: /app/frontend/src/revenuecat.tsx (provider, logIn on auth, entitlement gate), paywall /app/frontend/app/settings/upgrade.tsx. Backend honors `X-Plan: PRO` header set by the client when the `pro` entitlement is active.

## Check for project_state in revenuecat status api response. if the project_state is less then project_created, re-fetch RevenueCat playbook via the integration expert tool.
Status check:
`curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/51ccafcc-b4e2-4839-bb8e-5b86236489cf/status"`

## Later updates to user's products (integration proxy apis ONLY — NEVER call the RevenueCat REST API)
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/51ccafcc-b4e2-4839-bb8e-5b86236489cf/products
  body: {"products":[{"package":"$rc_monthly","price":14.99,"currency":"USD","period":"P1M","trial":"P1W","prices":[{"amount_micros":14990000,"currency":"USD"}]}]}
  (amount_micros = price × 1,000,000; omit "trial" for none)
- Remove a package:
  DELETE $INTEGRATION_PROXY_URL/internal/revenuecat/projects/51ccafcc-b4e2-4839-bb8e-5b86236489cf/products/%24rc_monthly
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Taking in-app purchases LIVE — store-side steps (USER does these)
Needed ONLY for REAL purchases in published store builds. All steps are in the FAQ section of the payments panel:
1. Upload App Store Connect API key (.p8) / Google Play service-account JSON in RevenueCat dashboard (Apps → app).
2. Set up payment profiles in App Store Connect and Play Console.
3. Create matching IAP products with the SAME product IDs shown in the RevenueCat dashboard.
4. Release build → test via TestFlight / Play internal testing → submit for review.
