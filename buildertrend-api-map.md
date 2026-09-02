# Buildertrend API map

Unofficial internal routes used by the Wattle Court gateway.
Org: Caldon Homes Pty Ltd t/as Wattle Court Mid-Coast. Observed `builderId` **110310**.
Host: `https://buildertrend.net`.

Do not commit HAR files or cookies. `useSession=` on a query string is a boolean flag, not a secret.

## Session / chrome

| Verb | Method | Path | Notes |
| --- | --- | --- | --- |
| `session.status` | GET | `/apix/v2/context/init` | |
| `session.status` | GET | `/api/AccountInfo/GlobalInfo` | `needsToRelogin` |
| `jobs.picker.list` | POST | `/api/jobpicker/GetJobPickerData` | |
| `jobs.picker.select` | POST | `/api/jobpicker/SetJobPickerData` | Required before most job-scoped grids |
| `jobs.picker.existing` | GET | `/api/jobpicker/GetExistingJobList` | |

## Jobs

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `jobs.list` | POST | `/api/Jobsites/Grid` | Captured. Filters `GET /api/Filters/33` |
| `jobs.get` | GET | `/api/jobsites/{jobId}` | Captured |
| `jobs.accountingLink` | GET | `/api/Accounting/{jobId}/LinkedEntityInfo` | Captured |
| `jobs.create` | | `/api/jobsites/Add` (JS backlog) | **not_captured** |
| `jobs.update` | | Job Info Save not clicked | **not_captured** |

## Lead Opportunities

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `leads.list` | POST | `/api/Leads/Grid` | Captured |
| `leads.get` | GET | `/api/Leads/{id}` | Captured |
| `leads.defaults` | GET | `/api/Leads/Defaults` | Captured |
| `leads.create` / `update` | | | **not_captured** |
| `leads.convertToJob` | | `canConvertToJob` on GET | **send_disabled** |

Related Sales URLs (`/app/leads/activities` etc.) stay out of scope.

## Contacts

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `contacts.list` | POST | `/api/Contacts/Grid` | Captured |
| `contacts.get` | GET | `/api/Contacts/{id}/Details` | Captured. `id=0` = add form |
| `contacts.create` / `update` | | | **not_captured** |

## Owner invoices (progress claims)

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `invoices.list` | POST | `/api/OwnerInvoices/Grid` | Captured. Filters `GET /api/Filters/39` |
| `invoices.get` | GET | `/apix/v3/Invoices/get-invoice?invoiceId=&job=` | Captured |
| `invoices.accountingStatus` | GET | `/api/accounting/GetEntityAccountingStatus?...entityType=3` | Captured |
| `invoices.changes` | GET | `/apix/v2/EntityChangeTracking/entity-changes` | Captured |
| `invoices.saveDraft` | | Save was not in the DOM on the Ranchlands draft tab | **not_captured** |
| `invoices.addLines` | | JS: `/api/LineItems/EntityAttachmentsToInvoice` | **not_captured** |
| `invoices.send` | | | **send_disabled** |

UI: `/app/OwnerInvoices`, `/app/OwnerInvoices/OwnerInvoice/{invoiceId}/{jobId}/false` (`0` = new).
Custom invoice # unique per jobsite. GST tax group **78952** when the tax engine is on (`GET /api/TaxGroups/Dropdown`).

## Change orders / variations

| Verb | Method | Path | Content-Type | Status |
| --- | --- | --- | --- | --- |
| `variations.list` | POST | `/api/ChangeOrders/Grid` | json | Captured |
| `variations.get` | GET | `/api/ChangeOrders/{id}/changeOrder?presentingScreen=0&isMobile=false` | | Captured |
| `variations.saveDraftHeader` | PUT | `/api/ChangeOrders/{id}/Update` | json | Captured. `approvalStatus` 0 |
| `variations.updateLine` | PUT | `/apix/v2/LineItems/update-change-order-line-item` | **merge-patch+json** | Captured |
| `variations.addLines` | POST | `/apix/v2/LineItems/add-change-order-line-items` | json (merge-patch not required) | Captured |
| `variations.deleteLines` | DELETE | `/apix/v2/LineItems/delete-change-order-line-items` | json | Captured |
| `variations.createDraft` | | `GET /api/ChangeOrders/Defaults`, `/apix/v2/ChangeOrders/{id}/create-draft` | | **not_captured** |
| `variations.notifyOwners` | | JS `notify-owners` | | **send_disabled** |

### GST rule (locked, Wattle Court COs)

Native tax does **not** persist (`effectiveTaxVersion=0`, `taxGroupId` null, `POST .../bulk-update-tax-rate` → **500**). `tax_engine_unusable` if asked to use it.

Dummy line:

- Cost code **4000 GST** (`costCode` numeric id **17072421**, not `costCodeId`)
- Title `[GST001] GST on Total Owner Price`
- `unitCost` `0.10`, `quantity` = owner price of the real lines (1/11 of GST-inclusive total)
- `taxGroupId`: **null** (do not send `-1`)
- `pageTypeEnum`: **6**
- Do **not** send `costCodeId`, `costItemId`, `lineItemType`, `itemTitle`, `markupColumn` on add (those 500)

GST must be 1/11 of **owner** price, never builder cost.

Cost-code search: `POST /api/Search?limit=10` `{search, jobIds, categories:[30]}`.

## Bills

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `bills.list` | POST | `/api/v1/bills/grid` | Captured |
| `bills.tabCounts` | POST | `/apix/v2/Bills/tab-counts` | Captured |
| `bills.get` | GET | `/api/v1/bills/{id}` | Captured |
| `bills.file` | GET | `/api/files/{id}` / `preview` | Captured |
| `bills.create` | POST | `/api/v1/bills?jobId=` | Captured in this repo. Draft, never pay |
| `bills.update` | | | **not_captured** |
| `bills.markReadyForPayment` | | `canMarkReadyForPayment` | **send_disabled**. Xero pays |

## Purchase orders

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `pos.list` | POST | `/api/PurchaseOrders/Grid` | Captured |
| `pos.get` | GET | `/api/PurchaseOrders/{id}` | Captured. Linked bills/bids/approvals are read from this payload |
| `pos.create` / `update` | | | **not_captured**. Do not auto-approve |

## Estimates

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `estimates.worksheet` | GET | `/api/Proposals/{jobId}/Worksheet` | Captured |
| `estimates.updateLine` | PUT | `/apix/v2/LineItems/update-estimate-line-item` | JS only, **not_captured** |
| `estimates.addLines` | POST | `/apix/v2/LineItems/add-estimate-line-items` | JS only, **not_captured** |
| `estimates.sendToBudget` | | `isSentToBudget` | **send_disabled** |

Respect `worksheetLocked`.

## Documents

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `docs.root` | GET | `/api/MediaFolders/MainDirectory?...mediaType=1` | Captured |
| `docs.folder` | GET | `/api/MediaFolders/GetDirectoryDetails?...` | Captured |
| `docs.file` | GET | `/api/files/{id}` | Captured |
| `docs.upload` | | | **not_captured** |

## Job costing

| Verb | Method | Path | Status |
| --- | --- | --- | --- |
| `costing.header` | POST | `/apix/v2/JobCostingBudget` | Captured |
| `costing.views` | GET | `/apix/v3/JobCostingBudget/{jobId}` | Captured |
| `costing.lines` | POST | `/apix/v2/JobCostingBudget/line-items` | Captured |
| writes | | | Out of scope (budget lock) |

## Out of scope

Warranty, Service, full GL, client portal admin, Schedule, Selections, RFIs, Time Clock, Bids, lead activities/map/calendar/proposals, daily logs, tasks, plans, messages, Mixpanel/Datadog/Sentry/Qualtrics.

## Capture appends

New captures from `pnpm --filter gateway capture` are appended below. Cookies are stripped.
