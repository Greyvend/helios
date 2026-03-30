/**
 * TextGenerationRouter - Routes text generation requests to the appropriate
 * provider (Codex or Claude) based on the model specified in each request.
 *
 * When no model is specified, delegates to the Codex implementation (default).
 * When a Claude model is detected, delegates to the Claude implementation.
 *
 * @module TextGenerationRouterLive
 */
import { Effect, Layer } from "effect";
import { inferProviderForModel } from "@helios-dev/shared/model";

import type { TextGenerationShape } from "../Services/TextGeneration.ts";
import { TextGeneration } from "../Services/TextGeneration.ts";
import { makeCodexTextGeneration } from "./CodexTextGeneration.ts";
import { makeClaudeTextGeneration } from "./ClaudeTextGeneration.ts";

const makeTextGenerationRouter = Effect.gen(function* () {
  const codexImpl = yield* makeCodexTextGeneration;
  const claudeImpl = yield* makeClaudeTextGeneration;

  const resolve = (model: string | undefined): TextGenerationShape => {
    if (!model) return codexImpl;
    const provider = inferProviderForModel(model, "codex");
    return provider === "claudeAgent" ? claudeImpl : codexImpl;
  };

  return {
    generateCommitMessage: (input) =>
      Effect.suspend(() => resolve(input.model).generateCommitMessage(input)),
    generatePrContent: (input) =>
      Effect.suspend(() => resolve(input.model).generatePrContent(input)),
    generateBranchName: (input) =>
      Effect.suspend(() => resolve(input.model).generateBranchName(input)),
  } satisfies TextGenerationShape;
});

export const TextGenerationRouterLive = Layer.effect(TextGeneration, makeTextGenerationRouter);
