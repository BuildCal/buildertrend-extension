# Buildertrend API map — used-module overnight pass

Unofficial internal routes for the Buildertrend gateway.
Host: `https://buildertrend.net`. Builder id comes from GlobalInfo after login.

Do not commit HAR files, cookies, `Authorization`, or `Cookie` values.
`useSession=` on a query string is a **boolean flag**, not a secret.

Writes that were **actually fired** this pass:

| Method | Path | Content-Type |
| --- | --- | --- |
| PUT | `/api/ChangeOrders/{id}/Update` | `application/json` |
| PUT | `/apix/v2/LineItems/update-change-order-line-item` | `application/merge-patch+json` |
| POST | `/apix/v2/LineItems/add-change-order-line-items` | `application/json` |
| DELETE | `/apix/v2/LineItems/delete-change-order-line-items` | `application/json` |
| POST | `/api/jobpicker/GetJobPickerData` | `application/json` |
| POST | `/api/jobpicker/SetJobPickerData` | `application/json` |

All other writes below are **not_captured**. Do not invent them.

---

## Session / chrome

| Verb | Method | Path | Notes |
| --- | --- | --- | --- |
| `session.status` | GET | `/apix/v2/context/init` | Builder context |
| `session.status` | GET | `/api/AccountInfo/GlobalInfo` | `needsToRelogin` → stop writes |
| `jobs.picker.list` | POST | `/api/jobpicker/GetJobPickerData` | **Fired** |
| `jobs.picker.select` | POST | `/api/jobpicker/SetJobPickerData` | **Fired.** Required before most job-scoped grids |
| `jobs.picker.existing` | GET | `/api/jobpicker/GetExistingJobList` | |

Dedicated **gateway** Chrome profile / cookie jar only. Never dual-drive the human daily tab.

---

## Jobs

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `jobs.list` | POST | `/api/Jobsites/Grid` | Captured. Filters `GET /api/Filters/33` |
| `jobs.get` | GET | `/api/jobsites/{jobId}` | Captured |
| `jobs.accountingLink` | GET | `/api/Accounting/{jobId}/LinkedEntityInfo` | Captured (Accounting) |
| Risk / insurance | | Job page companion on overnight pass | Read with `jobs.get` / Accounting. Do not invent a second URL |
| `jobs.create` | | JS backlog `/api/jobsites/Add`, `/api/jobsites/DefaultInfo`. UI `/app/JobPage/0/1?openCondensed=true` | **not_captured** |
| `jobs.update` | | Job Info Save was not clicked | **not_captured** |

---

## Lead Opportunities

Only Sales surface we use. Related URLs (`/app/leads/activities`, map, calendar, proposals) stay out of scope.

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `leads.list` | POST | `/api/Leads/Grid` | Captured |
| `leads.get` | GET | `/api/Leads/{id}` | Captured. `canConvertToJob` may be present |
| `leads.defaults` | GET | `/api/Leads/Defaults` | Captured |
| `leads.create` / `leads.update` | | Likely `POST`/`PUT /api/Leads` | **not_captured**. Do not submit leftover `/Lead/0` from 2026-09-02 |
| `leads.convertToJob` | | Creates a real job | **send_disabled** |

---

## Contacts

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `contacts.list` | POST | `/api/Contacts/Grid` | Captured |
| `contacts.get` | GET | `/api/Contacts/{id}/Details` | Captured. `id=0` = add form |
| `contacts.create` / `update` | | | **not_captured**. Capture a sandbox contact Save |

---

## Owner invoices (progress claims)

UI: `/app/OwnerInvoices`, `/app/OwnerInvoices/OwnerInvoice/{invoiceId}/{jobId}/false` (`0` = new).

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `invoices.list` | POST | `/api/OwnerInvoices/Grid` | Captured. Filters `GET /api/Filters/39` |
| `invoices.get` | GET | `/apix/v3/Invoices/get-invoice?invoiceId=&job=` | Captured |
| `invoices.accountingStatus` | GET | `/api/accounting/GetEntityAccountingStatus?...entityType=3` | Captured |
| `invoices.changes` | GET | `/apix/v2/EntityChangeTracking/entity-changes` | Captured |
| `invoices.saveDraft` | | Save was **not** in the DOM on the observed draft tab | **not_captured** |
| `invoices.addLines` | | JS: `/api/LineItems/EntityAttachmentsToInvoice` | **not_captured** |
| `invoices.send` | | | **send_disabled** |

Custom invoice # must be unique per jobsite. Toast: `The Custom Invoice # has already been used for this jobsite`. ID input is flaky — re-read before save.

**GST on owner invoices (not COs):** use the tenant’s tax group from `GET /api/TaxGroups/Dropdown` when the tax engine is on. This is **not** the change-order dummy-line pattern.

---

## Change orders / variations

Most complete writes. Dummy-line GST pattern.

| Verb | Method | Path | Content-Type | Status |
| --- | --- | --- | --- | --- |
| `variations.list` | POST | `/api/ChangeOrders/Grid` | json | Captured |
| `variations.get` | GET | `/api/ChangeOrders/{id}/changeOrder?presentingScreen=0&isMobile=false` | | Captured |
| `variations.saveDraftHeader` | PUT | `/api/ChangeOrders/{id}/Update` | json | **Fired.** Keep `approvalStatus` 0 |
| `variations.updateLine` | PUT | `/apix/v2/LineItems/update-change-order-line-item` | **merge-patch+json** | **Fired** |
| `variations.addLines` | POST | `/apix/v2/LineItems/add-change-order-line-items` | json (merge-patch not required) | **Fired** |
| `variations.deleteLines` | DELETE | `/apix/v2/LineItems/delete-change-order-line-items` | json | **Fired** |
| `variations.createDraft` | | `GET /api/ChangeOrders/Defaults`, `/apix/v2/ChangeOrders/{id}/create-draft` | | **not_captured** |
| `variations.notifyOwners` | | JS `notify-owners` | | **send_disabled** |

### GST rule (locked) + restore

Native tax **does not persist** on observed COs (`effectiveTaxVersion=0`, `taxGroupId` null). `POST .../bulk-update-tax-rate` → **500**. Do not send a hard-coded tax group on change orders. Do not send `taxGroupId: -1`. Gateway returns `tax_engine_unusable` if asked to use the native engine or if Search cannot resolve **4000 GST**.

GST is a **dummy line**:

- Cost code title **4000 GST**. Field is `costCode` (numeric id from Search), **not** `costCodeId`
- Resolve via `POST /api/Search?limit=10` `{search:"4000 GST", jobIds, categories:[30]}` before add. Do not hard-code a cost code
- Title `[GST001] GST on Total Owner Price`
- `unitCost` `0.10`, `quantity` = **exclusive owner price** of the real lines (1/11 of GST-inclusive total)
- Example fixture: exclusive **1100.00** → GST **110.00** → inclusive **1210.00**. Never builder cost
- `taxGroupId`: **null**
- `pageTypeEnum`: **6**
- Do **not** send `costCodeId`, `costItemId`, `lineItemType`, `itemTitle`, `markupColumn` on add (those 500)

After line edits, recompute the dummy line. Restore means: if a human or a failed tax POST wiped GST, `variations.recomputeGst` puts the dummy line back from owner price.

---

## Bills (project AP in BT)

Xero remains the pay path. Never pay from the gateway.

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `bills.list` | POST | `/api/v1/bills/grid` | Captured |
| `bills.tabCounts` | POST | `/apix/v2/Bills/tab-counts` | Captured |
| `bills.get` | GET | `/api/v1/bills/{id}` | Captured |
| `bills.file` | GET | `/api/files/{id}` / `preview` | Captured |
| `bills.create` | | Old sidecar used `POST /api/v1/bills`. **Not fired** on this overnight pass | **not_captured** |
| `bills.update` | | | **not_captured** |
| `bills.markReadyForPayment` | | `canMarkReadyForPayment` exists | **send_disabled** |

If a create payload is ever captured: `readyForPayment`, `payInFull`, `payOnline`, `sendToAccounting` must stay false.

---

## Purchase orders

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `pos.list` | POST | `/api/PurchaseOrders/Grid` | Captured |
| `pos.get` | GET | `/api/PurchaseOrders/{id}` | Captured |
| `pos.linkedBills` | GET | `/api/PurchaseOrders/{id}/LinkedBills` | Captured (overnight) |
| `pos.linkedBids` | GET | `/api/PurchaseOrders/{id}/linked-bids` | Captured (overnight) |
| `pos.approvals` | GET | `/api/PurchaseOrders/{id}/EntityApprovals` | Captured (overnight). Do not auto-approve |
| `pos.create` / `update` | | | **not_captured** |

Project expenses only. Never workers comp / icare / tax / payroll.

---

## Estimates / worksheet

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `estimates.worksheet` | GET | `/api/Proposals/{jobId}/Worksheet` | Captured. Read-only |
| `estimates.updateLine` | PUT | `/apix/v2/LineItems/update-estimate-line-item` | JS only, **not_captured** |
| `estimates.addLines` | POST | `/apix/v2/LineItems/add-estimate-line-items` | JS only, **not_captured** |
| `estimates.sendToBudget` | | `isSentToBudget` | **send_disabled** |

Respect `worksheetLocked`. Budget lock can hurt jobs.

---

## Documents

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `docs.root` | GET | `/api/MediaFolders/MainDirectory?...mediaType=1` | Captured |
| `docs.folder` | GET | `/api/MediaFolders/GetDirectoryDetails?...` | Captured |
| `docs.file` | GET | `/api/files/{id}` | Captured |
| `docs.upload` | | | **not_captured** |

---

## Job costing

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `costing.header` | POST | `/apix/v2/JobCostingBudget` | Captured |
| `costing.views` | GET | `/apix/v3/JobCostingBudget/{jobId}` | Captured |
| `costing.lines` | POST | `/apix/v2/JobCostingBudget/line-items` | Captured |
| `costing.searchCostCodes` | POST | `/api/Search?limit=10` `{search, jobIds, categories:[30]}` | Captured |
| writes | | | Out of scope (budget lock) |

---

## Addendum — modules touched but not mapped

Schedule, Selections, RFIs, Time Clock, and Bids were opened on the overnight pass and **not** mapped. Leave them **not_captured**. Do not implement.

Skip unused: Warranty (0 rows), Service (no nav), full GL, client portal admin, lead activities/map/calendar/proposals, daily logs, tasks, plans, messages, Mixpanel / Datadog / Sentry / Qualtrics.

APIx writes often use `application/merge-patch+json`. `/api/*` grids use `application/json`.

---

## Safety

- Default every write to Draft / Not sent
- `BT_GATEWAY_ENABLE_SEND=false`
- On `needsToRelogin: true` or 401: stop writes, `auth_required`
- Conflict: if BT changed after last pull, do not overwrite

## Capture appends

New captures from `pnpm --filter gateway capture` are appended below. Cookies are stripped.
