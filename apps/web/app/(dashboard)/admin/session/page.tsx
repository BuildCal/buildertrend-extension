import { auth } from "@/lib/auth";
import { btService } from "@/lib/bt-service";

import { uploadCookies } from "./actions";

export default async function SessionRefreshPage() {
  await auth();
  let status: Awaited<ReturnType<typeof btService.sessionStatus>> | null = null;
  try {
    status = await btService.sessionStatus();
  } catch {
    // ignore - banner already shown
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Refresh Buildertrend session</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The team&apos;s automation uses your logged-in BT session. Refresh it
          each morning so bill posting keeps working.
        </p>
      </div>

      {/* Status panel */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-3 font-medium">Current status</h2>
        {status === null ? (
          <p className="text-sm text-destructive">bt-service is unreachable.</p>
        ) : status.is_authenticated ? (
          <div className="text-sm">
            <p className="text-green-700">✓ Session is active</p>
            <p className="mt-1 text-muted-foreground">
              Last verified:{" "}
              {status.last_verified_at
                ? new Date(status.last_verified_at).toLocaleString()
                : "never"}
            </p>
            <p className="text-muted-foreground">
              Captured by: {status.captured_by ?? "(unknown)"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-yellow-700">
            ⚠ No active session. Bill posting is paused until you refresh.
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-3 font-medium">How to refresh</h2>
        <ol className="ml-5 list-decimal space-y-3 text-sm">
          <li>
            Open <strong>buildertrend.net</strong> in Chrome and make sure
            you&apos;re logged in.
          </li>
          <li>
            If not already installed, add the{" "}
            <a
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              &quot;Get cookies.txt LOCALLY&quot;
            </a>{" "}
            extension.
          </li>
          <li>
            Click the extension icon while on the Buildertrend tab and{" "}
            <strong>Export</strong>. You&apos;ll get a <code>.txt</code> file.
          </li>
          <li>Upload that file below.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          The file is parsed locally and only the buildertrend cookies are
          extracted and sent to the bt-service. The file itself is not stored.
        </p>
      </div>

      {/* Upload form */}
      <div className="rounded-lg border bg-card p-6">
        <form action={uploadCookies} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cookiesFile" className="text-sm font-medium">
              Cookies file (Netscape format)
            </label>
            <input
              id="cookiesFile"
              name="cookiesFile"
              type="file"
              accept=".txt"
              required
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Upload &amp; verify
          </button>
        </form>
      </div>
    </div>
  );
}
