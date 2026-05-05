/**
 * Server-side client for calling the bt-service (Python FastAPI).
 *
 * NEVER import this from a "use client" component. The INTERNAL_API_TOKEN
 * must not leak to the browser.
 */

import "server-only";

import { z } from "zod";

const BT_SERVICE_URL = process.env.BT_SERVICE_URL!;
const INTERNAL_API_TOKEN = process.env.BT_SERVICE_INTERNAL_TOKEN!;

if (!BT_SERVICE_URL || !INTERNAL_API_TOKEN) {
  throw new Error(
    "BT_SERVICE_URL and BT_SERVICE_INTERNAL_TOKEN must be set in env."
  );
}

class BTServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail: unknown
  ) {
    super(message);
  }
}

async function callService(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${BT_SERVICE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_API_TOKEN,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    throw new BTServiceError(
      `bt-service ${method} ${path} failed: ${res.status}`,
      res.status,
      payload
    );
  }

  return payload;
}

// ---------- typed schemas ----------

const SessionStatusSchema = z.object({
  is_authenticated: z.boolean(),
  expires_estimated_at: z.string().nullable().optional(),
  last_verified_at: z.string().nullable().optional(),
  captured_by: z.string().nullable().optional(),
});

const VendorSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable().optional(),
  is_active: z.boolean(),
  user_type: z.number(),
});

const CreateBillResponseSchema = z.object({
  bill_id: z.number(),
  external_id: z.string(),
  status: z.enum(["created", "duplicate"]),
});

const BillRowSchema = z
  .object({
    id: z.number(),
    jobId: z.number(),
    jobName: z.string().nullable().optional(),
    billNumberLink: z
      .object({
        title: z.string(),
        id: z.number(),
      })
      .nullable()
      .optional(),
    billTitleLink: z
      .object({
        title: z.string(),
        id: z.number(),
      })
      .nullable()
      .optional(),
    paymentAmount: z
      .object({
        value: z.number(),
        scale: z.number(),
      })
      .nullable()
      .optional(),
    invoicedDate: z.string().nullable().optional(),
    datePaid: z.string().nullable().optional(),
    dueDate: z
      .object({
        date: z.string().nullable().optional(),
        isPastDue: z.boolean().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    payTo: z
      .object({
        payTo: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    purchaseOrderPaymentStatus: z
      .object({
        paymentStatus: z.number().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    billPurchaseOrderNumber: z.string().nullable().optional(),
    addedBy: z.string().nullable().optional(),
  })
  .passthrough();

const ListBillsResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      data: z.array(BillRowSchema),
      records: z.number(),
      page: z.number(),
      totalPages: z.number(),
      pageSize: z.number(),
      billsToApproveCount: z.number().optional(),
    })
    .passthrough(),
});

const TabCountsSchema = z.object({
  draftBillsCount: z.number(),
  inReviewBillsCount: z.number(),
  readyForPaymentBillsCount: z.number(),
  paidBillsCount: z.number(),
  otherBillsCount: z.number(),
});

// ---------- public API ----------

export const btService = {
  async sessionStatus() {
    const data = await callService("GET", "/sessions/status");
    return SessionStatusSchema.parse(data);
  },

  async refreshSession(input: {
    cookies: Record<string, { value: string; domain: string; path: string }>;
    captured_by_user_id: string;
  }) {
    const data = await callService("POST", "/sessions/refresh", input);
    return SessionStatusSchema.parse(data);
  },

  async listVendorsForJob(jobId: number) {
    const data = await callService(
      "GET",
      `/lookups/vendors-for-job/${jobId}`
    );
    return z.array(VendorSchema).parse(data);
  },

  async listBills(params: {
    page?: number;
    pageSize?: number;
    status?: "draft" | "in_review" | "ready_for_payment" | "paid" | "other" | "all";
    jobIds?: number[];
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
    search?: string;
  }) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("page_size", String(params.pageSize));
    if (params.status) qs.set("status", params.status);
    if (params.jobIds?.length) qs.set("job_ids", params.jobIds.join(","));
    if (params.sortColumn) qs.set("sort_column", params.sortColumn);
    if (params.sortDirection) qs.set("sort_direction", params.sortDirection);
    if (params.search) qs.set("search", params.search);
    const data = await callService("GET", `/bills?${qs.toString()}`);
    return ListBillsResponseSchema.parse(data);
  },

  async getBillTabCounts(params: { jobIds?: number[]; search?: string }) {
    const qs = new URLSearchParams();
    if (params.jobIds?.length) qs.set("job_ids", params.jobIds.join(","));
    if (params.search) qs.set("search", params.search);
    const data = await callService(
      "GET",
      `/bills/_meta/tab-counts?${qs.toString()}`
    );
    return TabCountsSchema.parse(data);
  },

  async createBill(input: {
    job_id: number;
    vendor_id: number;
    bill_number: string;
    bill_title: string;
    invoice_date: string;
    due_date: string;
    description?: string;
    line_items: {
      cost_code_id: number;
      title: string;
      description?: string;
      quantity: number;
      unit_cost: number;
      unit_type?: string;
      cost_types?: number[];
    }[];
    purchase_order_id?: number | null;
    source_extraction_id: string;
  }) {
    const data = await callService("POST", "/bills", input);
    return CreateBillResponseSchema.parse(data);
  },
};

export { BTServiceError };
