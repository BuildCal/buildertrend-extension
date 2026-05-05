"use client";

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  ChevronsLeft,
  ChevronsRight,
  FileBox,
  LayoutDashboard,
  Receipt,
  ScrollText,
  ShieldCheck,
  Upload,
  UserCircle2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] =
  [
    {
      label: "BT Data",
      items: [
        { href: "/buildertrend/bills", label: "Bills", icon: Receipt },
        { href: "/jobs", label: "Jobs", icon: Briefcase },
        { href: "/pos", label: "Purchase Orders", icon: FileBox },
      ],
    },
    {
      label: "Accounts Payable",
      items: [
        { href: "/bills/upload", label: "Upload Invoices", icon: Upload },
        { href: "/bills", label: "Review Queue", icon: LayoutDashboard },
      ],
    },
    {
      label: "Admin",
      items: [
        { href: "/admin/session", label: "BT Session", icon: ShieldCheck },
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
      ],
    },
  ];

type SidebarProps = {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  children: ReactNode;
};

export function Sidebar({ userName, userEmail, children }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
        collapsed ? "w-[56px]" : "w-[240px]"
      }`}
    >
      <div className="flex h-12 items-center justify-between border-b border-slate-200 px-3">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-slate-900">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#4F46E5] text-[11px] font-bold text-white">
            BT
          </div>
          {!collapsed ? <span className="truncate">Buildertrend Tools</span> : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggle}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className={`mb-4 last:mb-0 ${collapsed ? "px-1" : "px-2"}`}>
            {!collapsed ? (
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`flex h-8 items-center gap-2 rounded-md text-[12.5px] font-medium transition-colors ${
                        collapsed ? "justify-center px-1" : "px-2"
                      } ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-700" : "text-slate-400"}`}
                      />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          className="mx-2 my-1 flex justify-center rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Expand sidebar"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      ) : null}

      <div className="border-t border-slate-200 p-2">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200">
                <UserCircle2 className="h-4 w-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-slate-700">{userName || userEmail}</div>
                <div className="truncate text-[10px] text-slate-400">{userEmail}</div>
              </div>
            </div>
            <div className="mt-1 px-2">{children}</div>
          </>
        ) : (
          <div className="flex justify-center py-1.5" title={userEmail ?? undefined}>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200">
              <UserCircle2 className="h-4 w-4 text-slate-500" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
