import { signOut } from "@/lib/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
      className="w-full"
    >
      <button
        type="submit"
        className="w-full rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        Sign out
      </button>
    </form>
  );
}
