import type { LLMAdapter } from "@/lib/llm/base";
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

  const local = await resolveLocal();
  if (local) {
    return local;
  }

  const hosted = await resolveHosted();
  if (hosted) {
    return hosted;
  }

  throw new ProviderUnavailableError(
    "No healthy LLM provider available. Configure ANTHROPIC_API_KEY or run Ollama locally.",
    {
      preference,
      localModel: process.env.OLLAMA_MODEL,
      hostedModel: process.env.ANTHROPIC_MODEL,
    },
  );
}
