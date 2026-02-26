import type { ZodType } from "zod";

export interface LLMJsonRequest<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMAdapter {
  readonly name: string;
  readonly model: string;
  isHealthy(): Promise<boolean>;
  generateJson<T>(request: LLMJsonRequest<T>): Promise<T>;
}
