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

  it("records not_captured attempts", async () => {
    const { store, invoke } = createHarness();
    await expect(invoke("invoices.saveDraft", { invoiceId: 1, jobId: 2 })).rejects.toMatchObject({
      code: "not_captured",
    });
    expect(store.commands.at(-1)?.errorCode).toBe("not_captured");
    await expect(invoke("invoices.addLines", { invoiceId: 1 })).rejects.toMatchObject({
      code: "not_captured",
    });
    expect(store.commands.at(-1)?.errorCode).toBe("not_captured");
  });
});
