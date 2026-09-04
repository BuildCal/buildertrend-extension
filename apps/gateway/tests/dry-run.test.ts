import { describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

describe("dry_run", () => {
  it("does not hit the network for writes when dry_run defaults on", async () => {
    const { calls, invoke } = createHarness();
    const result = await invoke("variations.addLines", {
      changeOrderId: 12,
      lines: [{ title: "Should not send", quantity: 1, unitCost: 5 }],
    });
    expect(result.dry_run).toBe(true);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("does not hit the network when dry_run is explicit true", async () => {
    const { calls, invoke } = createHarness();
    await invoke("variations.saveDraftHeader", { changeOrderId: 1, dry_run: true, header: {} });
    expect(calls).toHaveLength(0);
  });


  it("dry_runs invoices.saveDraft without not_captured", async () => {
    const { calls, invoke } = createHarness();
    const result = await invoke("invoices.saveDraft", {
      invoiceId: 1,
      jobId: 2,
      dry_run: true,
      header: { title: "x" },
    });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it("still hits the network for reads", async () => {
    const { calls, invoke } = createHarness();
    await invoke("jobs.get", { jobId: 42 });
    expect(calls.some((c) => c.path === "/api/jobsites/42")).toBe(true);
  });

  it("dry_runs invoices.addLines without not_captured", async () => {
    const { calls, invoke } = createHarness();
    const result = await invoke("invoices.addLines", {
      invoiceId: 1,
      jobId: 2,
      dry_run: true,
      lines: [{ title: "x", ownerPrice: 0 }],
    });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
