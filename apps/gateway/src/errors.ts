export const ERROR_CODES = [
  "auth_required",
  "not_captured",
  "send_disabled",
  "duplicate_invoice_id",
  "tax_engine_unusable",
  "conflict",
  "sandbox_required",
  "dry_run",
  "bt_error",
  "validation",
  "not_found",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class GatewayError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    httpStatus?: number,
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus ?? statusFor(code);
  }

  toJSON(): Record<string, unknown> {
    return {
      ok: false,
      error: this.code,
      message: this.message,
      ...this.details,
    };
  }
}

function statusFor(code: ErrorCode): number {
  switch (code) {
    case "auth_required":
      return 401;
    case "not_captured":
      return 501;
    case "send_disabled":
      return 403;
    case "duplicate_invoice_id":
      return 409;
    case "tax_engine_unusable":
      return 422;
    case "conflict":
      return 409;
    case "sandbox_required":
      return 403;
    case "dry_run":
      return 200;
    case "validation":
      return 400;
    case "not_found":
      return 404;
    default:
      return 502;
  }
}

export function isGatewayError(err: unknown): err is GatewayError {
  return err instanceof GatewayError;
}
