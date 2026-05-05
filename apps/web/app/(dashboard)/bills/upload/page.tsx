import { UploadInvoicesClient } from "./upload-client";

export default function UploadInvoicesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold leading-tight text-slate-900">Upload Invoices</h1>
        <p className="mt-1 text-[12px] text-slate-500">
          Drop one or more PDFs or images. Each is uploaded, then extracted with AI, then added to the
          review queue.
        </p>
      </div>

      <UploadInvoicesClient />
    </div>
  );
}
