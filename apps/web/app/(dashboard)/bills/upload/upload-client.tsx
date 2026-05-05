"use client";

import {
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";

type FileStatus = "pending" | "uploading" | "extracting" | "creating" | "complete" | "error";

interface UploadingFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  invoiceId?: string;
  summary?: string;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function UploadInvoicesClient() {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const updateFile = (id: string, patch: Partial<UploadingFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const processFile = async (entry: UploadingFile) => {
    const { id, file } = entry;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      updateFile(id, { status: "error", error: `Unsupported type: ${file.type}` });
      return;
    }
    if (file.size > MAX_SIZE) {
      updateFile(id, { status: "error", error: "File exceeds 10MB" });
      return;
    }

    try {
      updateFile(id, { status: "uploading", progress: 10 });

      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch("/api/invoices/upload", {
        method: "POST",
        body: form,
      });
      if (!upRes.ok) {
        const j = (await upRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Upload failed (${upRes.status})`);
      }
      const { filePath, fileType } = (await upRes.json()) as { filePath: string; fileType: string };

      updateFile(id, { status: "extracting", progress: 50 });

      const exRes = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, fileType }),
      });
      if (!exRes.ok) {
        const j = (await exRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Extraction failed (${exRes.status})`);
      }
      const { data: extracted } = (await exRes.json()) as {
        data?: { supplier?: { name?: string | null }; totals?: { total?: number | null } };
      };

      updateFile(id, { status: "creating", progress: 85 });

      const crRes = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, extracted, originalFileName: file.name }),
      });
      if (!crRes.ok) {
        const j = (await crRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Could not create invoice (${crRes.status})`);
      }
      const { invoiceId } = (await crRes.json()) as { invoiceId: string };

      const total = extracted?.totals?.total;
      updateFile(id, {
        status: "complete",
        progress: 100,
        invoiceId,
        summary: `${extracted?.supplier?.name ?? "Unknown vendor"} · $${total != null ? total : "?"}`,
      });
    } catch (e) {
      updateFile(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleFiles = (incoming: File[]) => {
    const wrapped: UploadingFile[] = incoming.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: "pending" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...wrapped]);
    void (async () => {
      for (const f of wrapped) await processFile(f);
    })();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) handleFiles(dropped);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const allComplete = files.length > 0 && files.every((f) => f.status === "complete");

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={onPick}
          className="hidden"
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="text-[13.5px] font-medium text-slate-700">Drop invoices here or click to select</p>
        <p className="mt-1 text-[11.5px] text-slate-500">
          PDF, PNG, JPG, or WEBP · up to 10MB each · multiple files OK
        </p>
      </div>

      {files.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <span className="text-[12px] font-medium text-slate-700">
              {files.length} file{files.length === 1 ? "" : "s"}
              {" · "}
              {files.filter((f) => f.status === "complete").length} complete
              {files.some((f) => f.status === "error") ? (
                <span className="text-red-600">
                  {" · "}
                  {files.filter((f) => f.status === "error").length} error
                </span>
              ) : null}
            </span>
            {allComplete ? (
              <button
                type="button"
                onClick={() => router.push("/bills")}
                className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                Go to review queue →
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{f.file.name}</div>
                  {f.summary ? (
                    <div className="truncate text-[11.5px] text-slate-500">{f.summary}</div>
                  ) : null}
                  {f.error ? <div className="truncate text-[11.5px] text-red-600">{f.error}</div> : null}
                </div>
                <StatusIcon status={f.status} />
                {f.invoiceId && f.status === "complete" ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/bills/${f.invoiceId}`)}
                    className="text-[11.5px] text-indigo-600 hover:text-indigo-700"
                  >
                    Review
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case "pending":
      return <span className="text-[10.5px] text-slate-400">queued</span>;
    case "uploading":
      return (
        <span className="flex items-center gap-1 text-[10.5px] text-indigo-600">
          <Loader2 className="h-3 w-3 animate-spin" /> uploading
        </span>
      );
    case "extracting":
      return (
        <span className="flex items-center gap-1 text-[10.5px] text-indigo-600">
          <Loader2 className="h-3 w-3 animate-spin" /> extracting
        </span>
      );
    case "creating":
      return (
        <span className="flex items-center gap-1 text-[10.5px] text-indigo-600">
          <Loader2 className="h-3 w-3 animate-spin" /> saving
        </span>
      );
    case "complete":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
