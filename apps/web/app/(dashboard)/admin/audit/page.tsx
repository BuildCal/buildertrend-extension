import { prisma } from "@/lib/prisma";

export default async function AuditPage() {
  const entries = await prisma.auditLogEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
    include: { user: { select: { email: true, name: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Last 200 events. Persistent and append-only.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Resource</th>
              <th className="px-4 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {entry.timestamp.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  {entry.user?.email ?? "system"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                  {entry.action}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {entry.resourceId ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      view
                    </summary>
                    <pre className="mt-1 max-w-xl overflow-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(entry.detail, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
