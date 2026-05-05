/**
 * Anthropic SDK wrapper.
 *
 * Used for invoice extraction (and any future AI features).
 */

import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// The model we use for extraction. Override here if needed.
export const EXTRACTION_MODEL = "claude-sonnet-4-20250514";
