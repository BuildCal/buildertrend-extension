# Session refresh process

How the team keeps the Buildertrend connection alive.

## Daily routine (admin)

Every morning, before the team starts approving bills:

1. Open https://buildertrend.net in Chrome and log in normally.
2. Visit the BT Tools admin → Refresh Buildertrend session page.
3. Use the "Get cookies.txt LOCALLY" extension to export cookies.
4. Upload the file. The page verifies the session is valid before
   storing it.

Takes about 30 seconds.

## What the system does for you

- The web app shows a yellow banner across all pages when no valid
  session is stored, so the team knows immediately that things are paused.
- The bt-service verifies cookies actually work before persisting them
  (we don't want to store a broken session).
- All actions during a bad-session period queue up in the bills queue
  and resume automatically once the session is refreshed.

## Session lifetime

We don't yet have a firm number for how long a BT session lasts. Anecdotal
observations from this project so far:

- Sessions persist across browser restarts as long as the underlying
  refresh tokens stay valid.
- Auth0 access tokens are typically short-lived (~24h) but the .NET app
  refreshes them silently as long as the refresh token works.
- Inactivity timeouts may apply but we haven't characterised them.

**Action item:** keep an eye on when sessions actually fail. If we see
failures only every few days, the morning ritual is overkill. If we see
midday failures, we need to support a "refresh from your phone" flow.

## When refresh fails

Symptoms: yellow banner stays up after upload, OR upload says cookies
were uploaded but session is not authenticated.

Likely causes:

1. **Cookies were exported before login completed.** Solution: refresh the
   BT page in Chrome, wait for it to fully load, re-export.
2. **Wrong site cookies.** The exporter has a "current site" filter — make
   sure the active tab is buildertrend.net when you export.
3. **You're logged into multiple tenants/accounts.** BT may be sending you
   to a different one. Confirm you see your normal dashboard before exporting.
4. **MFA challenge pending.** If BT is asking you to re-verify, the
   session isn't fully authenticated. Complete it first.

## Future automation

When this becomes annoying, we'll add a Playwright-driven nightly refresh:

- A small headless browser instance running on the bt-service host
- Stored credentials (encrypted) for one designated BT user
- Runs at 3am every night
- If it hits an MFA prompt, sends a notification and falls back to manual

This is a project of about a day. Worth doing when the team is using the
tool daily and the morning ritual starts to feel routine.
