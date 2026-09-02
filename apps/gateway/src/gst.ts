import { GST_LINE_TITLE, GST_PAGE_TYPE_ENUM, GST_UNIT_COST } from "./config.js";

export interface VariationLineLike {
  id?: number | string | null;
  title?: string | null;
  itemTitle?: string | null;
  costCode?: number | null;
  costCodeId?: number | null;
  quantity?: number | null;
  unitCost?: number | null;
  ownerPrice?: number | null;
  ownerUnitCost?: number | null;
  builderCost?: number | null;
  taxGroupId?: number | null;
  pageTypeEnum?: number | null;
}

export interface GstDummyLine {
  costCode: number;
  title: string;
  unitCost: number;
  quantity: number;
  taxGroupId: null;
  pageTypeEnum: number;
}

export const GST_ADD_FORBIDDEN_FIELDS = [
  "costCodeId",
  "costItemId",
  "lineItemType",
  "itemTitle",
  "markupColumn",
] as const;

export function isGstDummyLine(line: VariationLineLike): boolean {
  const title = `${line.title ?? ""} ${line.itemTitle ?? ""}`;
  if (title.includes("[GST001]") || /4000\s*GST/i.test(title)) return true;
  return false;
}

/** Owner price of one real (non-GST) line. Never uses builder cost. */
export function ownerAmount(line: VariationLineLike): number {
  if (typeof line.ownerPrice === "number" && Number.isFinite(line.ownerPrice)) {
    return line.ownerPrice;
  }
  const qty = typeof line.quantity === "number" ? line.quantity : 1;
  const unit =
    typeof line.ownerUnitCost === "number"
      ? line.ownerUnitCost
      : typeof line.unitCost === "number"
        ? line.unitCost
        : 0;
  return qty * unit;
}

export function ownerPriceOfRealLines(lines: VariationLineLike[]): number {
  return lines.filter((line) => !isGstDummyLine(line)).reduce((sum, line) => sum + ownerAmount(line), 0);
}

/** GST is 1/11 of the GST-inclusive owner total = 10% of exclusive owner price. */
export function gstFromExclusiveOwnerPrice(exclusiveOwnerPrice: number): number {
  return roundMoney(exclusiveOwnerPrice * GST_UNIT_COST);
}

export function gstFromInclusiveOwnerTotal(inclusiveOwnerTotal: number): number {
  return roundMoney(inclusiveOwnerTotal / 11);
}

export function inclusiveFromExclusive(exclusiveOwnerPrice: number): number {
  return roundMoney(exclusiveOwnerPrice + gstFromExclusiveOwnerPrice(exclusiveOwnerPrice));
}

export function buildGstDummyLine(exclusiveOwnerPrice: number, costCode: number): GstDummyLine {
  return {
    costCode,
    title: GST_LINE_TITLE,
    unitCost: GST_UNIT_COST,
    quantity: roundMoney(exclusiveOwnerPrice),
    taxGroupId: null,
    pageTypeEnum: GST_PAGE_TYPE_ENUM,
  };
}

export function pickGstCostCodeFromSearch(payload: unknown): number | undefined {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = (root.data ?? root) as Record<string, unknown>;
  const lists = [data.results, data.items, data.costCodes, data.data, payload];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const title = String(rec.title ?? rec.name ?? rec.displayName ?? rec.code ?? "");
      const code = String(rec.code ?? rec.displayCode ?? rec.title ?? "");
      const isGst = /4000\s*GST/i.test(`${title} ${code}`) || /^4000$/.test(code.trim());
      if (!isGst) continue;
      const id = rec.costCode ?? rec.id ?? rec.costCodeId;
      if (typeof id === "number" && Number.isFinite(id)) return id;
      if (typeof id === "string" && Number.isFinite(Number(id))) return Number(id);
    }
  }
  return undefined;
}

export function recomputeGstDummyLine(
  lines: VariationLineLike[],
  costCode: number,
): {
  exclusiveOwnerPrice: number;
  gstAmount: number;
  inclusiveOwnerTotal: number;
  dummy: GstDummyLine;
  existingGstLineId: number | undefined;
} {
  const exclusiveOwnerPrice = roundMoney(ownerPriceOfRealLines(lines));
  const existing = lines.find(isGstDummyLine);
  const existingId = typeof existing?.id === "number" ? existing.id : undefined;
  const dummy = buildGstDummyLine(exclusiveOwnerPrice, costCode);
  return {
    exclusiveOwnerPrice,
    gstAmount: gstFromExclusiveOwnerPrice(exclusiveOwnerPrice),
    inclusiveOwnerTotal: inclusiveFromExclusive(exclusiveOwnerPrice),
    dummy,
    existingGstLineId: existingId,
  };
}

export function assertNoForbiddenGstAddFields(payload: Record<string, unknown>): string[] {
  return GST_ADD_FORBIDDEN_FIELDS.filter((field) => field in payload && payload[field] != null);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ownerInvoiceCustomId(jobNumber: string, sequence: number): string {
  const slug = jobNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "JOB";
  const seq = String(sequence).padStart(4, "0");
  return `INV-${slug}-${seq}`;
}

export function isDuplicateInvoiceMessage(message: string | undefined): boolean {
  if (!message) return false;
  return /custom invoice # has already been used for this jobsite/i.test(message);
}
