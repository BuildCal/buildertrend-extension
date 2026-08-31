# Buildertrend API notes

Unofficial notes from reverse-engineering Buildertrend’s internal HTTP API.
This is **not** a public or supported API. Endpoints change without notice.
Update this file when you discover new ones or when BT changes existing ones.

## Base URLs

- Standard endpoints: `https://buildertrend.net/api/...`
- v2 endpoints:        `https://buildertrend.net/apix/v2/...`

## Authentication

- Cookie-based session. Critical cookies are `HttpOnly`:
  - `.AspNet.Auth0` — Auth0-issued auth cookie (large, ~2.8KB)
  - `ASP.NET_SessionId` — server session
  - `__AntiXsrfToken` — anti-CSRF token (cookie, NOT echoed in headers)
  - `GAESA` — Google App Engine session affinity

- **TLS fingerprint check.** Connections must look like Chrome. Plain
  Python `requests` is rejected with a 302 to `/app/error`. Use
  `curl-cffi` with `impersonate="chrome"`.

## Required headers

The minimum that worked from a captured browser session:

- `user-agent: Mozilla/5.0 ... Chrome/147.0.0.0 Safari/537.36`
- `content-type: application/json`
- `portaltype: 1`  (1 = builder portal)
- `referer: https://buildertrend.net/app/Landing`
- `accept: */*`
- `sec-fetch-mode: cors`, `sec-fetch-site: same-origin`, etc.

No anti-CSRF header is required despite the cookie existing.

## Standard response envelope

`/api/...` endpoints return:

```json
{
  "success": true,
  "message": "",
  "needsToRelogin": false,
  "sessionJobInfo": null,
  "data": { ... },
  "metadata": {},
  "forcedUpgrade": null
}
```

`/apix/v2/...` endpoints often return data at the top level instead:

```json
{ "costCodesWithBudget": [ ... ] }
```

`needsToRelogin: true` is the canonical "session expired" signal.

## Endpoints we use

### Sanity check
- `GET /api/AccountInfo/GlobalInfo` — cheapest call to verify auth.

### Bill creation flow
- `GET /api/v1/bills/defaultinfo?jobId={jobId}&isBillRemainingAction=false`
  - Returns vendor list (under `data.assignedTo.options[group=Subs/Vendors]`),
    default field values, validators.
- `GET /apix/v2/JobCostingBudget/budget-cost-codes?jobId={jobId}`
  - Cost codes available for this job (may be empty for jobs without budgets).
- `GET /apix/v2/Bills/get-available-purchase-orders/{vendorId}/{vendorType}/{jobId}`
  - Open POs for vendor on job. `vendorType=2` for subs/vendors.
- `GET /api/v1/Bills/GetBillMapping?purchaseOrderId={poId}&jobId={jobId}&billId=0`
  - Pre-fills line items from a PO.
- `POST /api/v1/bills?jobId={jobId}` — create bill. Payload shape in
  `apps/bt-service/app/routes/bills.py:_build_bt_bill_payload`.
- `GET /api/v1/bills/{billId}` — fetch saved bill.

### Lookups
- `GET /api/jobpicker/GetExistingJobList` — all jobs for the user.
- `POST /api/jobpicker/GetJobPickerData` — paginated/filtered jobs.

### Not yet captured (TODO)
- File attachment (multipart upload)
- Bill update (PUT/PATCH)
- Bill deletion

## User type enum (`performingUserType`)

Seen in `assignedTo.options[].extraData.userType`:
- `0` — Unassigned/system
- `1` — Internal user
- `2` — Sub/Vendor
- `3` — Misc (uses `miscPaidToName` instead of an ID)

## Cost types in line items

The `costTypes: [7]` value is what showed up consistently in captured
payloads. We use `7` as the default and don't yet know the full enum.
If it ever rejects, capture a fresh HAR and inspect.
