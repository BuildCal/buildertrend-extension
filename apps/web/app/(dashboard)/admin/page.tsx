import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <ul className="space-y-2">
        <li>
          <Link href="/admin/session" className="text-sm font-medium hover:underline">
            → Refresh Buildertrend session
          </Link>
        </li>
        <li>
          <Link href="/admin/audit" className="text-sm font-medium hover:underline">
            → Audit log
          </Link>
        </li>
        <li>
          <Link href="/admin/users" className="text-sm font-medium hover:underline">
            → Users
          </Link>
        </li>
      </ul>
    </div>
  );
}
