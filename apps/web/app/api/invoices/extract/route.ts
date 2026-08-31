import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { EXTRACTION_MODEL, getAnthropic } from "@/lib/anthropic";
import { auth } from "@/lib/auth";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

export interface ExtractedInvoiceData {
  supplier: {
    name: string | null;
    abn: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  invoice: {
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    po_reference: string | null;
    job_reference: string | null;
  };
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
  }>;
  totals: {
    subtotal: number | null;
    gst: number | null;
    total: number;
  };
  confidence: {
    overall: number;
    supplier: number;
    invoice_details: number;
    line_items: number;
    totals: number;
  };
  warnings: string[];
}

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from construction industry invoices and bills.

Analyze this invoice document and extract the following information. Return ONLY valid JSON with no markdown formatting, no code blocks, no additional text - just the raw JSON object.

{
  "supplier": {
    "name": "Business name exactly as shown on invoice",
    "abn": "11 digit Australian Business Number without spaces, or null if not found",
    "address": "Full address if visible, or null",
    "email": "Email if visible, or null",
    "phone": "Phone if visible, or null"
  },
  "invoice": {
    "invoice_number": "Invoice number or tax invoice number",
    "invoice_date": "Date in YYYY-MM-DD format",
    "due_date": "Due date in YYYY-MM-DD format, or null if not shown",
    "po_reference": "Any PO, purchase order, or order number mentioned, or null",
    "job_reference": "Any job, project, site, or address reference, or null"
  },
  "line_items": [
    {
      "description": "Item description",
      "quantity": 1,
      "unit_price": 100.00,
      "amount": 100.00
    }
  ],
  "totals": {
    "subtotal": 100.00,
    "gst": 10.00,
    "total": 110.00
  },
  "confidence": {
    "overall": 0.95,
    "supplier": 0.98,
    "invoice_details": 0.90,
    "line_items": 0.85,
    "totals": 0.99
  },
  "warnings": ["List any issues or unclear items here"]
}

Important rules:
- Return ONLY the JSON object, no other text
- Use null for any field that is not visible or unclear
- ABN must be exactly 11 digits with no spaces, or null
- All dates must be YYYY-MM-DD format
- All monetary amounts must be numbers, not strings
- Confidence scores range from 0.0 to 1.0
- For Australian invoices, GST is typically 10% of the subtotal
- Look for PO references in headers, footers, or reference fields
- Job references might be labeled as "Site", "Project", "Job", "Address", or "Delivery Address"

Special handling for invoices without individual line item pricing:
- Some invoices (like supplier quotes) list multiple items with descriptions but NO individual prices
- These invoices only show a total at the bottom (Subtotal, GST, Total)
- If you see line items with descriptions but no unit_price or amount values, set:
  - quantity: null or 1
  - unit_price: null (not 0)
  - amount: 0 (to indicate no pricing)
- Still extract all line item descriptions for reference
- The totals section should still have the actual subtotal, GST, and total amounts
- Add a warning in the warnings array: "Invoice has line items but no individual pricing - only total provided"
`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { filePath, fileType } = body as { filePath?: string; fileType?: string };

    if (!filePath) {
      return NextResponse.json({ error: "filePath required" }, { status: 400 });
    }

    const { data: fileData, error: downloadError } = await getSupabaseAdmin()
      .storage.from(STORAGE_BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("[extract] download error:", downloadError);
      return NextResponse.json(
        { error: "Failed to download file", details: downloadError?.message },
        { status: 500 },
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";
    const lower = filePath.toLowerCase();
    if (fileType?.includes("png") || lower.endsWith(".png")) {
      mediaType = "image/png";
    } else if (
      fileType?.includes("jpeg") ||
      fileType?.includes("jpg") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg")
    ) {
      mediaType = "image/jpeg";
    } else if (fileType?.includes("webp") || lower.endsWith(".webp")) {
      mediaType = "image/webp";
    } else {
      mediaType = "application/pdf";
    }

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] =
      mediaType === "application/pdf"
        ? [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            } as Anthropic.Messages.ContentBlockParam,
            { type: "text", text: EXTRACTION_PROMPT },
          ]
        : [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ];

    const response = await getAnthropic().messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonStr = fence[1].trim();
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];

    let extracted: ExtractedInvoiceData;
    try {
      extracted = JSON.parse(jsonStr) as ExtractedInvoiceData;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse extracted JSON", rawResponse: textBlock.text.slice(0, 1000) },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: extracted });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("[extract] Anthropic error:", error.status, error.message);
      return NextResponse.json(
        { error: "AI extraction failed", details: error.message, status: error.status },
        { status: 500 },
      );
    }
    console.error("[extract] error:", error);
    return NextResponse.json(
      {
        error: "Extraction failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
