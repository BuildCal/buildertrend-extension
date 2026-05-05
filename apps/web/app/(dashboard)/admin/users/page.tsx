import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.name ?? "—"}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">{u.isActive ? "yes" : "no"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {u.createdAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        User creation is intentionally CLI-only for now —{" "}
        <code>pnpm --filter web exec tsx scripts/seed.ts</code>
      </p>
    </div>
  );
}
