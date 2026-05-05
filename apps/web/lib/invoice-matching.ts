/**
 * Match raw extraction strings (vendor names, job references) to BT entities.
 *
 * Used to pre-populate the invoice review form. Match logic is conservative —
 * we only auto-suggest if confidence is high. The user can always pick
 * manually from the dropdowns.
 */

import { prisma } from "@/lib/prisma";

/**
 * Normalize a string for fuzzy comparison: lowercase, strip Pty/Ltd/Inc
 * suffixes, remove punctuation, collapse whitespace.
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(pty|ltd|inc|llc|limited|p\/l|pty\.|ltd\.)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VendorMatch {
  btVendorId: number;
  name: string;
  confidence: "exact" | "alias" | "fuzzy";
}

/**
 * Try to match a raw vendor name to a `bt_vendors` row.
 *
 * 1. Exact normalized match against bt_vendors.name → confidence "exact"
 * 2. Match against vendor_aliases → confidence "alias"
 * 3. (TODO) Fuzzy match using pg_trgm or Levenshtein
 */
export async function matchVendor(rawName: string | null): Promise<VendorMatch | null> {
  if (!rawName) return null;
  const needle = normalizeName(rawName);
  if (!needle) return null;

  const allVendors = await prisma.btVendor.findMany({
    select: { btVendorId: true, name: true },
  });
  for (const v of allVendors) {
    if (normalizeName(v.name) === needle) {
      return { btVendorId: v.btVendorId, name: v.name, confidence: "exact" };
    }
  }

  const aliases = await prisma.vendorAlias.findMany({
    select: { btVendorId: true, alias: true },
  });
  for (const a of aliases) {
    if (normalizeName(a.alias) === needle) {
      const vendor = allVendors.find((v) => v.btVendorId === a.btVendorId);
      if (vendor) {
        return { btVendorId: vendor.btVendorId, name: vendor.name, confidence: "alias" };
      }
    }
  }

  return null;
}

export interface JobMatch {
  btJobId: number;
  name: string;
  confidence: "exact" | "contains";
}

/**
 * Try to match a raw job reference (often a partial address) to a `bt_jobs` row.
 *
 * 1. Exact normalized match → "exact"
 * 2. Substring match in either direction → "contains"
 */
export async function matchJob(rawRef: string | null): Promise<JobMatch | null> {
  if (!rawRef) return null;
  const needle = normalizeName(rawRef);
  if (!needle) return null;

  const jobs = await prisma.btJob.findMany({
    select: { btJobId: true, name: true },
  });

  for (const j of jobs) {
    if (normalizeName(j.name) === needle) {
      return { btJobId: j.btJobId, name: j.name, confidence: "exact" };
    }
  }

  for (const j of jobs) {
    const haystack = normalizeName(j.name);
    if (haystack.includes(needle) || needle.includes(haystack)) {
      return { btJobId: j.btJobId, name: j.name, confidence: "contains" };
    }
  }

  return null;
}

/**
 * Fetch lightweight lookups for the form's dropdowns. We send only what's
 * needed for rendering — id + display string.
 */
export async function getInvoiceFormLookups() {
  const [jobs, vendors] = await Promise.all([
    prisma.btJob.findMany({
      orderBy: { name: "asc" },
      select: { btJobId: true, name: true, jobNumber: true },
    }),
    prisma.btVendor.findMany({
      orderBy: { name: "asc" },
      select: { btVendorId: true, name: true, email: true },
    }),
  ]);
  return { jobs, vendors };
}
