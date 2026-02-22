import type { Request, Response } from "express";
import { buildModelList } from "../utils/openai-format.js";

/**
 * GET /v1/models
 *
 * Returns a list containing the single "claude-code" model.
 * OpenAI-compatible clients use this to discover available models.
 */
export function modelsHandler(_req: Request, res: Response): void {
  res.json(buildModelList());
}
