import { describe, expect, it } from "vitest";
import { createHarness } from "./helpers.js";

describe("command log", () => {
  it("records dry-run writes with a payload summary and no secrets", async () => {
    const { store, invoke } = createHarness();
    await invoke("variations.saveDraftHeader", {
      changeOrderId: 7,
      header: { title: "Draft extra", cookie: "SHOULD_NOT_APPEAR" },
    });
    expect(store.commands).toHaveLength(1);
    const row = store.commands[0]!;
    expect(row.verb).toBe("variations.saveDraftHeader");
    expect(row.dryRun).toBe(true);
    expect(JSON.stringify(row.payloadSummary)).not.toMatch(/SHOULD_NOT_APPEAR/);
    expect(row.payloadSummary.keys).toEqual(expect.arrayContaining(["changeOrderId", "header"]));
  });

  it("records dry-run for captured invoice saveDraft and addLines", async () => {
    const { store, invoke } = createHarness();
    const preview = await invoke("invoices.saveDraft", {
      invoiceId: 1,
      jobId: 2,
      dry_run: true,
      header: { title: "x" },
    });
    expect(preview.dry_run).toBe(true);
    expect(store.commands.at(-1)?.verb).toBe("invoices.saveDraft");
    expect(store.commands.at(-1)?.dryRun).toBe(true);
    const add = await invoke("invoices.addLines", {
      invoiceId: 1,
      jobId: 2,
      dry_run: true,
      lines: [{ title: "y", ownerPrice: 0 }],
    });
    expect(add.dry_run).toBe(true);
    expect(store.commands.at(-1)?.verb).toBe("invoices.addLines");
    expect(store.commands.at(-1)?.dryRun).toBe(true);
    expect(store.commands.at(-1)?.errorCode).toBeUndefined();
  });
});
