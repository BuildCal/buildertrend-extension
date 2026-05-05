import Link from "next/link";

interface Props {
  status: {
    is_authenticated: boolean;
    last_verified_at?: string | null;
    captured_by?: string | null;
  } | null;
}

export function SessionStatusBanner({ status }: Props) {
  if (status === null) {
    return (
      <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
        bt-service is unreachable. Check that the Python service is running.
      </div>
    );
  }

  if (!status.is_authenticated) {
    return (
      <div className="border-b bg-yellow-100 px-4 py-2 text-sm text-yellow-900">
        Buildertrend session expired or never set.{" "}
        <Link href="/admin/session" className="underline font-medium">
          Refresh now
        </Link>{" "}
        to resume bill posting.
      </div>
    );
  }

  return null;
}
