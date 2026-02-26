import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-latest"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  ANALYSIS_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  ANALYSIS_LLM_SCOPE: z.enum(["deep_only", "all"]).default("deep_only"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  ANALYSIS_MAX_CONCURRENCY: process.env.ANALYSIS_MAX_CONCURRENCY,
  ANALYSIS_LLM_SCOPE: process.env.ANALYSIS_LLM_SCOPE,
});
