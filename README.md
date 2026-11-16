# Hisobot Pro Max

Static Uzbek bookkeeping application. Open index.html through a local HTTP server.
Guest entries stay in this browser. Signed-in accounts have separate local caches
and sync individual entries to `users/{uid}/entries/{entryId}`.

## Firebase setup (required for Gmail and cloud sync)

1. Copy the **existing project's public Web app config** from Firebase Console
   into `config.js`. Do not create invented credentials or put a service-account key here.
2. Enable Google Authentication and authorize the actual hosting domain.
3. Verify the owner email in both `config.js` and `firestore.rules`.
4. Review and deploy rules with `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.
5. Deploy Hosting only when authorized: `firebase deploy --only hosting --project YOUR_PROJECT_ID`.

This repository does not contain the project's real Firebase Web configuration.
Until it is supplied, guest mode works but Gmail, grants and cloud sync do not.
No Firebase deployment was performed as part of the repair.

## Preserving existing records

Legacy `kunlik-hisobot:*` storage and the guest cache are never deleted or silently
assigned to a Gmail account. Sign in to the correct account and choose
**Eski yozuvlarni ko’chirish**, then confirm ownership. Import merges by ID and
keeps the original copy. Export a JSON backup first. Existing Claude-hosted DB
records require an explicit export from that environment; this build deliberately
does not open the unscoped Claude database automatically.

Cloud writes use separate entry documents so adding another entry cannot replace
another device's entire day. Unsent entry changes are persisted locally and merged
over snapshots. Retry with **Bulutga qayta saqlash** or reconnect. Simultaneous
edits to the same entry and settings use last-write-wins. Settings changes are also queued locally and retried on reconnect or with the retry button. A full reload requires
internet to load Firebase SDKs; this is not yet an installable offline PWA.

Free/Pro/Max are UI feature tiers. The local owner preview is only a device demo,
not a security boundary. Paid server operations must enforce entitlements using
trusted server time and authorization. The rules protect account data independently
of the displayed plan. Expiry dates are inclusive and use the device's local date;
the interface refreshes every minute and when returning to the page.

## Verification

Run `node --check script.js` and `node --test tests/regression.test.cjs`.
No external packages are required for regression tests. Real Firebase login,
deployed rules and two real accounts still need an integration check after setup.
