import type { LLMAdapter } from "@/lib/llm/base";
import { env } from "@/lib/env";
import { ProviderUnavailableError } from "@/lib/errors";
import { AnthropicAdapter } from "@/lib/llm/anthropic-adapter";
import { OllamaAdapter } from "@/lib/llm/ollama-adapter";
import type { ProviderPreference, ResolvedProvider } from "@/lib/types";

const ollamaAdapter = new OllamaAdapter();
const anthropicAdapter = new AnthropicAdapter();

export interface ResolvedLLM {
  provider: ResolvedProvider;
  adapter: LLMAdapter;
  model: string;
}

export function getAdapterForResolvedProvider(provider: ResolvedProvider): ResolvedLLM {
  if (provider === "local") {
    return {
      provider,
      adapter: ollamaAdapter,
      model: ollamaAdapter.model,
    };
  }

  return {
    provider,
    adapter: anthropicAdapter,
    model: anthropicAdapter.model,
  };
}

async function resolveLocal(): Promise<ResolvedLLM | null> {
  if (await ollamaAdapter.isHealthy()) {
    return {
      provider: "local",
      adapter: ollamaAdapter,
      model: ollamaAdapter.model,
    };
  }

  return null;
}

async function resolveHosted(): Promise<ResolvedLLM | null> {
  if (await anthropicAdapter.isHealthy()) {
    return {
      provider: "hosted",
      adapter: anthropicAdapter,
      model: anthropicAdapter.model,
    };
  }

  return null;
}

export async function resolveLLM(preference: ProviderPreference): Promise<ResolvedLLM> {
  if (preference === "local") {
    const local = await resolveLocal();
    if (!local) {
      throw new ProviderUnavailableError(
        "Local provider requested, but Ollama is unavailable. Start Ollama and pull the configured model.",
        { preference: "local", baseUrl: process.env.OLLAMA_BASE_URL, model: process.env.OLLAMA_MODEL },
      );
    }

    return local;
  }

  if (preference === "hosted") {
    const hosted = await resolveHosted();
    if (!hosted) {
      throw new ProviderUnavailableError(
        "Hosted provider requested, but Anthropic is unavailable. Check API key and model configuration.",
        { preference: "hosted", model: process.env.ANTHROPIC_MODEL },
      );
    }

    return hosted;
  }

  const resolverOrder =
    env.LLM_AUTO_PRIORITY === "hosted_first"
      ? [resolveHosted, resolveLocal]
      : [resolveLocal, resolveHosted];

  for (const resolveProvider of resolverOrder) {
    const resolved = await resolveProvider();
    if (resolved) {
      return resolved;
    }
  }

  throw new ProviderUnavailableError(
    "No healthy LLM provider available. Configure ANTHROPIC_API_KEY or run Ollama locally.",
    {
      preference,
      autoPriority: env.LLM_AUTO_PRIORITY,
      localModel: process.env.OLLAMA_MODEL,
      hostedModel: process.env.ANTHROPIC_MODEL,
    },
  );
}
