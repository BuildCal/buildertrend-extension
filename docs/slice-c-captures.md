# Slice C — remaining writes to capture

These verbs exist as MCP tools and HTTP routes. They return `not_captured` until a dedicated-profile capture lands. Do **not** invent the URL.

Use the gateway Chrome profile only. One draft save each. Leave **Not sent**.

| Verb | UI | Exact click | Expected path (hint only) |
| --- | --- | --- | --- |
| `invoices.saveDraft` | `/app/OwnerInvoices/OwnerInvoice/{invoiceId}/{jobId}/false` | Open Ranchlands draft **0003** (NMC0021) or Bayview **0007** (NMC0050). Re-read the custom invoice # (the input is flaky). Click **Save**, not Send. | Prior notes mentioned “some invoice save PUT” — unstable. Capture it. |
| `invoices.addLines` | Same draft | Add one line or attachment, Save (not Send). | JS: `/api/LineItems/EntityAttachmentsToInvoice` |
| `leads.create` / `leads.update` | Lead Opportunities add form from `GET /api/Leads/Defaults` | Fill Defaults, save a clearly fake lead Brad approves. **Do not** submit the leftover `/Lead/0` tab from 2026-09-02. | Likely `POST`/`PUT /api/Leads` or `PUT /api/Leads/{id}` |
| `contacts.create` / `contacts.update` | Contacts add form (`GET /api/Contacts/0/Details`) | Brad’s go — add one sandbox contact. Gateway takes this over from Bades. | Unknown POST/PUT |
| `variations.createDraft` | Change Orders → add new on a sandbox job | Open new CO so Defaults + create-draft fire. Leave Draft. | `GET /api/ChangeOrders/Defaults`, `/apix/v2/ChangeOrders/{id}/create-draft` |
| `pos.create` / `pos.update` | Purchase Orders on a sandbox job | Draft PO for a **project** expense. Do not approve. Never workers comp / icare / tax / payroll. | `/api/PurchaseOrders` |
| `bills.update` | Bills sandbox draft | Edit a restoreable field, Save. Do not mark ready for payment. (`bills.create` is already captured in this repo.) | `/api/v1/bills/{id}` |
| `estimates.updateLine` / `estimates.addLines` | Worksheet on an **unlocked** job | Edit or add one line, Save. Do not send to budget (`isSentToBudget`). | JS: `/apix/v2/LineItems/update-estimate-line-item`, `add-estimate-line-items` |
| `docs.upload` | Job documents, sandbox folder | Upload a tiny test file. | `/api/files`, `/api/MediaFolders` |
| `jobs.create` / `jobs.update` | `/app/JobPage/0/1?openCondensed=true` | Fake sandbox job Brad names, or dummy-field save then revert. Never guess the PUT body. | JS backlog: `/api/jobsites/Add`, `/api/jobsites/DefaultInfo` |

## Send tools (exist, locked)

`invoices.send` · `variations.notifyOwners` · `leads.convertToJob` · `bills.markReadyForPayment` · `estimates.sendToBudget`

These return `send_disabled` unless `BT_GATEWAY_ENABLE_SEND=true` **and** Brad enables that named tool. Default stays off.

## After each capture

1. Append lands on `buildertrend-api-map.md` (no cookies).
2. Implement the verb from the capture (replace the `not_captured` stub).
3. Replay once with `dry_run`, then one real draft.
4. GET to verify. Leave Not sent.
