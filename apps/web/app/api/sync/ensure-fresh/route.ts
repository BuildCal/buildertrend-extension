import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureFreshSync } from "@/lib/sync";

/**
 * POST /api/sync/ensure-fresh — runs a sync if data is stale.
 * Auth required (regular user session, not internal token).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ensureFreshSync();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
