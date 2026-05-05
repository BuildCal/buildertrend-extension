"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { btService } from "@/lib/bt-service";
import { prisma } from "@/lib/prisma";

/**
 * Parse a Netscape-format cookies.txt file and extract the buildertrend cookies.
 *
 * Format (per line, tab-separated):
 *   domain  flag  path  secure  expiration  name  value
 * Lines starting with # are comments; blank lines ignored.
 */
function parseNetscapeCookies(text: string) {
  const cookies: Record<string, { value: string; domain: string; path: string }> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^#HttpOnly_/, ""); // tolerate this prefix
    if (!line || line.startsWith("#")) continue;

    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [domain, , path, , , name, value] = parts;

    if (!domain.toLowerCase().includes("buildertrend")) continue;

    cookies[name] = { value, domain, path: path || "/" };
  }

  return cookies;
}

export async function uploadCookies(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("unauthenticated");

  const file = formData.get("cookiesFile");
  if (!(file instanceof File)) throw new Error("Missing cookies file");

  const text = await file.text();
  const cookies = parseNetscapeCookies(text);

  // Sanity check — the auth-critical cookies must be present
  const required = [".AspNet.Auth0", "ASP.NET_SessionId"];
  const missing = required.filter((name) => !(name in cookies));
  if (missing.length > 0) {
    throw new Error(
      `Missing required cookies: ${missing.join(", ")}. ` +
        `Make sure you exported while logged into buildertrend.net.`
    );
  }

  const status = await btService.refreshSession({
    cookies,
    captured_by_user_id: session.user.id,
  });

  // Mirror status to local DB so dashboards can read without round-trip
  await prisma.bTSessionStatus.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      isAuthenticated: status.is_authenticated,
      capturedById: session.user.id,
      capturedAt: new Date(),
      lastVerifiedAt: status.last_verified_at ? new Date(status.last_verified_at) : null,
    },
    update: {
      isAuthenticated: status.is_authenticated,
      capturedById: session.user.id,
      capturedAt: new Date(),
      lastVerifiedAt: status.last_verified_at ? new Date(status.last_verified_at) : null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "session.refresh",
    detail: {
      cookieCount: Object.keys(cookies).length,
      authenticated: status.is_authenticated,
    },
  });

  if (!status.is_authenticated) {
    throw new Error(
      "Cookies uploaded but BT rejected the session. Try re-logging in to BT and exporting again."
    );
  }

  revalidatePath("/admin/session");
  redirect("/admin/session?ok=1");
}
