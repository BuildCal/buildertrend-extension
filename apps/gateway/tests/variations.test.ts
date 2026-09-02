import { describe, expect, it } from "vitest";
import { CONTENT_JSON, CONTENT_MERGE_PATCH } from "../src/adapter.js";
import { GST_COST_CODE, GST_LINE_TITLE } from "../src/config.js";
import { createHarness } from "./helpers.js";

function variationGet(lines: unknown[]) {
  return {
    status: 200,
    contentType: CONTENT_JSON,
    json: { success: true, data: { id: 55, approvalStatus: 0, lineItems: lines } },
  };
}

describe("variation draft + GST recompute", () => {
  it("keeps approvalStatus 0 on header save", async () => {
    const { calls, invoke } = createHarness(async (req) => {
      if (req.method === "GET") return variationGet([]);
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: { ok: true } } };
    });
    await invoke("variations.saveDraftHeader", {
      changeOrderId: 55,
      dry_run: false,
      header: { title: "Draft extra", approvalStatus: 4 },
    });
    const update = calls.find((c) => c.method === "PUT" && c.path.includes("/Update"));
    expect((update?.json as { approvalStatus: number }).approvalStatus).toBe(0);
  });

  it("recomputes the GST dummy from owner price after addLines", async () => {
    let lines: Record<string, unknown>[] = [
      { id: 1, title: "Tile extra", ownerPrice: 2000, builderCost: 800 },
    ];
    const { calls, invoke } = createHarness(async (req) => {
      if (req.path.includes("changeOrder") && req.method === "GET") return variationGet(lines);
      if (req.path.includes("add-change-order-line-items")) {
        const body = req.json as { lineItems: Record<string, unknown>[] };
        for (const line of body.lineItems ?? []) {
          lines = [...lines, { id: lines.length + 10, ...line }];
        }
        return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: { lineItems: lines } } };
      }
      if (req.path.includes("update-change-order-line-item")) {
        return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
      }
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
    });

    const result = await invoke("variations.addLines", {
      changeOrderId: 55,
      dry_run: false,
      lines: [{ title: "Joinery", ownerPrice: 3000, quantity: 1, unitCost: 3000, costCode: 99, taxGroupId: null, pageTypeEnum: 6 }],
    });

    expect(result.ok).toBe(true);
    const gstAdd = calls.filter((c) => c.path.includes("add-change-order-line-items"));
    expect(gstAdd.length).toBeGreaterThanOrEqual(1);
    const dummyCall = gstAdd.find((c) => {
      const items = (c.json as { lineItems: { title?: string }[] }).lineItems ?? [];
      return items.some((item) => item.title === GST_LINE_TITLE);
    });
    expect(dummyCall).toBeTruthy();
    const dummy = (dummyCall!.json as { lineItems: { costCode: number; quantity: number; taxGroupId: null }[] })
      .lineItems[0]!;
    expect(dummy.costCode).toBe(GST_COST_CODE);
    expect(dummy.quantity).toBe(5000);
    expect(dummy.taxGroupId).toBeNull();
    expect(dummyCall!.contentType ?? CONTENT_JSON).toBe(CONTENT_JSON);
    expect(JSON.stringify(dummyCall!.json)).not.toMatch(/costCodeId|itemTitle|markupColumn/);
  });

  it("updates an existing GST dummy instead of adding another", async () => {
    const lines = [
      { id: 1, title: "Real", ownerPrice: 1000 },
      { id: 2, title: GST_LINE_TITLE, costCode: GST_COST_CODE, quantity: 10, unitCost: 0.1 },
    ];
    const { calls, invoke } = createHarness(async (req) => {
      if (req.method === "GET") return variationGet(lines);
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
    });
    await invoke("variations.recomputeGst", { changeOrderId: 55, dry_run: false });
    const update = calls.find((c) => c.path.includes("update-change-order-line-item"));
    expect(update?.contentType).toBe(CONTENT_MERGE_PATCH);
    expect((update?.json as { id: number; quantity: number }).id).toBe(2);
    expect((update?.json as { quantity: number }).quantity).toBe(1000);
  });

  it("refuses conflict when BT changed after last pull", async () => {
    const { store, invoke } = createHarness(async (req) => {
      if (req.method === "GET") return variationGet([{ id: 1, title: "changed-in-bt" }]);
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
    });
    await store.setSyncState({
      entityType: "variation",
      externalId: "55",
      lastPulledHash: "old-hash",
    });
    await expect(
      invoke("variations.saveDraftHeader", { changeOrderId: 55, dry_run: false, header: { title: "x" } }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
