/**
 * Anthropic SDK wrapper for invoice extraction.
 *
 * Optional: the rest of the app boots without ANTHROPIC_API_KEY.
 * Extraction routes fail with a clear error until it is set.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export const EXTRACTION_MODEL = "claude-sonnet-4-20250514";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Invoice extraction is disabled until you add it."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}
