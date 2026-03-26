import {
  DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ProviderKind,
  type ServerProvider,
} from "@helios-dev/contracts";
import {
  getDefaultModel,
  normalizeModelSlug,
  resolveSelectableModel,
} from "@helios-dev/shared/model";
import { getComposerProviderState } from "./components/chat/composerProviderRegistry";

const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;

export type CustomModelSettings = {
  providers: {
    codex: { customModels: readonly string[] };
    claudeAgent: { customModels: readonly string[] };
  };
};

export type ProviderCustomModelConfig = {
  provider: ProviderKind;
  title: string;
  description: string;
  placeholder: string;
  example: string;
};

export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

const PROVIDER_CUSTOM_MODEL_CONFIG: Record<ProviderKind, ProviderCustomModelConfig> = {
  codex: {
    provider: "codex",
    title: "Codex",
    description: "Save additional Codex model slugs for the picker and `/model` command.",
    placeholder: "your-codex-model-slug",
    example: "gpt-6.7-codex-ultra-preview",
  },
  claudeAgent: {
    provider: "claudeAgent",
    title: "Claude",
    description: "Save additional Claude model slugs for the picker and `/model` command.",
    placeholder: "your-claude-model-slug",
    example: "claude-sonnet-5-0",
  },
};

export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  builtInModelSlugs: ReadonlySet<string> = new Set(),
  provider: ProviderKind = "codex",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

export function getCustomModelsForProvider(
  settings: CustomModelSettings,
  provider: ProviderKind,
): readonly string[] {
  return settings.providers[provider].customModels;
}

export function getDefaultCustomModelsForProvider(
  defaults: CustomModelSettings,
  provider: ProviderKind,
): readonly string[] {
  return defaults.providers[provider].customModels;
}

export function patchCustomModels(
  provider: ProviderKind,
  models: string[],
): { providers: Partial<Record<ProviderKind, { customModels: string[] }>> } {
  return {
    providers: {
      [provider]: { customModels: models },
    },
  };
}

export function getCustomModelsByProvider(
  settings: CustomModelSettings,
): Record<ProviderKind, readonly string[]> {
  return {
    codex: getCustomModelsForProvider(settings, "codex"),
    claudeAgent: getCustomModelsForProvider(settings, "claudeAgent"),
  };
}

export function getAppModelOptions(
  provider: ProviderKind,
  serverProviderModels: ReadonlyArray<{ slug: string; name: string; isCustom: boolean }>,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = serverProviderModels.map(({ slug, name, isCustom }) => ({
    slug,
    name,
    isCustom,
  }));
  const seen = new Set(options.map((option) => option.slug));
  const trimmedSelectedModel = selectedModel?.trim().toLowerCase();

  const builtInSlugs = new Set(serverProviderModels.filter((m) => !m.isCustom).map((m) => m.slug));
  for (const slug of normalizeCustomModelSlugs(customModels, builtInSlugs, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      slug,
      name: slug,
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  const selectedModelMatchesExistingName =
    typeof trimmedSelectedModel === "string" &&
    options.some((option) => option.name.toLowerCase() === trimmedSelectedModel);
  if (
    normalizedSelectedModel &&
    !seen.has(normalizedSelectedModel) &&
    !selectedModelMatchesExistingName
  ) {
    options.push({
      slug: normalizedSelectedModel,
      name: normalizedSelectedModel,
      isCustom: true,
    });
  }

  return options;
}

function getServerProviderModels(
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
): ReadonlyArray<ServerProvider["models"][number]> {
  return providers.find((p) => p.provider === provider)?.models ?? [];
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  settings: CustomModelSettings,
  providers: ReadonlyArray<ServerProvider>,
  selectedModel: string | null | undefined,
): string {
  const customModelsForProvider = getCustomModelsForProvider(settings, provider);
  const serverModels = getServerProviderModels(providers, provider);
  const options = getAppModelOptions(provider, serverModels, customModelsForProvider, selectedModel);
  return resolveSelectableModel(provider, selectedModel, options) ?? getDefaultModel(provider);
}

export function getCustomModelOptionsByProvider(
  settings: CustomModelSettings,
  providers: ReadonlyArray<ServerProvider>,
  selectedProvider?: ProviderKind | null,
  selectedModel?: string | null,
): Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>> {
  const customModelsByProvider = getCustomModelsByProvider(settings);
  return {
    codex: getAppModelOptions(
      "codex",
      getServerProviderModels(providers, "codex"),
      customModelsByProvider.codex,
      selectedProvider === "codex" ? selectedModel : undefined,
    ),
    claudeAgent: getAppModelOptions(
      "claudeAgent",
      getServerProviderModels(providers, "claudeAgent"),
      customModelsByProvider.claudeAgent,
      selectedProvider === "claudeAgent" ? selectedModel : undefined,
    ),
  };
}

export function resolveAppModelSelectionState(
  settings: CustomModelSettings & {
    textGenerationModelSelection: ModelSelection | undefined;
  },
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  const selection = settings.textGenerationModelSelection ?? {
    provider: "codex" as const,
    model: DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex,
  };
  const provider = selection.provider;
  const model = resolveAppModelSelection(provider, settings, providers, selection.model);
  const providerModels = getServerProviderModels(providers, provider);
  const { modelOptionsForDispatch } = getComposerProviderState({
    provider,
    model,
    models: providerModels,
    prompt: "",
    modelOptions: {
      [provider]: selection.options,
    },
  });

  return {
    provider,
    model,
    ...(modelOptionsForDispatch ? { options: modelOptionsForDispatch } : {}),
  };
}
