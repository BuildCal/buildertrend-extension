import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Activity } from "lucide-react";

import { Sidebar } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const getCachedBtStatus = unstable_cache(
  async () => {
    return prisma.bTSessionStatus.findUnique({ where: { id: "singleton" } });
  },
  ["bt-session-status"],
  { revalidate: 60 },
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const btStatus = await getCachedBtStatus();
  const btActive = !!btStatus?.isAuthenticated;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar userName={session.user.name} userEmail={session.user.email}>
        <SignOutButton />
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-end gap-3 border-b border-slate-200 bg-white px-4">
          <Link
            href="/admin/session"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
              btActive
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                : "animate-pulse bg-amber-50 text-amber-700 ring-amber-600/20"
            }`}
          >
            <Activity className="h-3 w-3" />
            {btActive ? "BT Connected" : "BT Session Expired"}
          </Link>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="page-enter p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
