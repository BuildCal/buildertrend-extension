import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds 10MB" }, { status: 400 });
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "pdf";
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filePath = `${yyyy}/${mm}/${id}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[upload] storage error:", uploadError);
      return NextResponse.json(
        { error: "Storage upload failed", details: uploadError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ filePath, fileType: file.type });
  } catch (error) {
    console.error("[upload] error:", error);
    return NextResponse.json(
      { error: "Upload failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
