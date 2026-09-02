import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenGstAddFields,
  buildGstDummyLine,
  gstFromExclusiveOwnerPrice,
  gstFromInclusiveOwnerTotal,
  inclusiveFromExclusive,
  isGstDummyLine,
  ownerInvoiceCustomId,
  ownerPriceOfRealLines,
  pickGstCostCodeFromSearch,
  recomputeGstDummyLine,
} from "../src/gst.js";
import { GST_LINE_TITLE } from "../src/config.js";

const FAKE_GST_COST_CODE = 99999;

describe("GST dummy-line math", () => {
  it("uses owner price, never builder cost", () => {
    const lines = [
      { title: "Plumbing extra", ownerPrice: 1100, builderCost: 9999, quantity: 1, unitCost: 9999 },
    ];
    expect(ownerPriceOfRealLines(lines)).toBe(1100);
    expect(gstFromExclusiveOwnerPrice(1100)).toBe(110);
    expect(inclusiveFromExclusive(1100)).toBe(1210);
    expect(gstFromInclusiveOwnerTotal(1210)).toBe(110);
  });

  it("quantity is exclusive owner price; unitCost is 0.10", () => {
    const dummy = buildGstDummyLine(2500, FAKE_GST_COST_CODE);
    expect(dummy).toEqual({
      costCode: FAKE_GST_COST_CODE,
      title: GST_LINE_TITLE,
      unitCost: 0.1,
      quantity: 2500,
      taxGroupId: null,
      pageTypeEnum: 6,
    });
    expect(dummy.quantity * dummy.unitCost).toBe(250);
  });

  it("ignores the existing GST dummy when summing owner price", () => {
    const computed = recomputeGstDummyLine(
      [
        { title: "Deck", ownerPrice: 1000 },
        { id: 99, title: GST_LINE_TITLE, costCode: FAKE_GST_COST_CODE, quantity: 50, unitCost: 0.1 },
      ],
      FAKE_GST_COST_CODE,
    );
    expect(computed.exclusiveOwnerPrice).toBe(1000);
    expect(computed.gstAmount).toBe(100);
    expect(computed.existingGstLineId).toBe(99);
    expect(computed.dummy.quantity).toBe(1000);
  });

  it("does not treat builder-cost-only as owner price when ownerPrice is present", () => {
    const lines = [{ ownerPrice: 1, builderCost: 9999, unitCost: 9999, quantity: 1 }];
    expect(ownerPriceOfRealLines(lines)).toBe(1);
  });

  it("rejects forbidden add-line fields", () => {
    expect(
      assertNoForbiddenGstAddFields({
        costCode: FAKE_GST_COST_CODE,
        title: GST_LINE_TITLE,
        costCodeId: 1,
        itemTitle: "nope",
      }),
    ).toEqual(["costCodeId", "itemTitle"]);
  });

  it("identifies dummy lines by title", () => {
    expect(isGstDummyLine({ title: "[GST001] GST on Total Owner Price" })).toBe(true);
    expect(isGstDummyLine({ title: "4000 GST" })).toBe(true);
    expect(isGstDummyLine({ title: "Plumbing" })).toBe(false);
  });

  it("resolves 4000 GST from a Search payload", () => {
    expect(
      pickGstCostCodeFromSearch({
        data: { results: [{ title: "4000 GST", costCode: 42, costCodeId: 99 }] },
      }),
    ).toBe(42);
  });

  it("builds a generic owner-invoice custom id from the job number", () => {
    expect(ownerInvoiceCustomId("JOB99", 3)).toBe("INV-JOB99-0003");
    expect(ownerInvoiceCustomId("9999", 7)).toBe("INV-9999-0007");
  });
});
