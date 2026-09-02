import { describe, expect, it } from "vitest";
import { CONTENT_JSON, CONTENT_MERGE_PATCH } from "../src/adapter.js";
import { createHarness } from "./helpers.js";

describe("merge-patch vs json content types", () => {
  it("uses merge-patch+json for variation line updates", async () => {
    const { calls, invoke } = createHarness(async (req) => {
      if (req.path.includes("changeOrder")) {
        return {
          status: 200,
          contentType: CONTENT_JSON,
          json: { success: true, data: { id: 1, lineItems: [] } },
        };
      }
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
    });

    await invoke("variations.updateLine", {
      changeOrderId: 1,
      dry_run: false,
      skipGstRecompute: true,
      line: { id: 9, title: "Extra", quantity: 1, unitCost: 10 },
    });

    const update = calls.find((c) => c.path.includes("update-change-order-line-item"));
    expect(update?.method).toBe("PUT");
    expect(update?.contentType).toBe(CONTENT_MERGE_PATCH);
  });

  it("uses application/json for variation line add", async () => {
    const { calls, invoke } = createHarness(async (req) => {
      if (req.path.includes("changeOrder")) {
        return {
          status: 200,
          contentType: CONTENT_JSON,
          json: { success: true, data: { id: 1, lineItems: [] } },
        };
      }
      return { status: 200, contentType: CONTENT_JSON, json: { success: true, data: {} } };
    });

    await invoke("variations.addLines", {
      changeOrderId: 1,
      dry_run: false,
      skipGstRecompute: true,
      lines: [{ title: "Extra", quantity: 1, unitCost: 10, costCode: 1, pageTypeEnum: 6, taxGroupId: null }],
    });

    const add = calls.find((c) => c.path.includes("add-change-order-line-items"));
    expect(add?.method).toBe("POST");
    expect(add?.contentType ?? CONTENT_JSON).toBe(CONTENT_JSON);
    expect(add?.contentType).not.toBe(CONTENT_MERGE_PATCH);
  });
});
