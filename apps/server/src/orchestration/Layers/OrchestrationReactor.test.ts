import { Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { CheckpointReactor } from "../Services/CheckpointReactor.ts";
import { ProviderCommandReactor } from "../Services/ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionService } from "../Services/ProviderRuntimeIngestion.ts";
import { OrchestrationReactor } from "../Services/OrchestrationReactor.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { makeOrchestrationReactor } from "./OrchestrationReactor.ts";

/**
 * Minimal stub for OrchestrationEngineService used in reactor tests.
 * Returns an empty read model so startup recovery is a no-op.
 */
const stubOrchestrationEngine = Layer.succeed(OrchestrationEngineService, {
  getReadModel: () =>
    Effect.succeed({
      snapshotSequence: 0,
      projects: [],
      threads: [],
      updatedAt: new Date().toISOString(),
    }),
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.empty,
});

/**
 * Minimal stub for ProviderService used in reactor tests.
 * Reports no live sessions so recovery has nothing to skip.
 */
const stubProviderService = Layer.succeed(ProviderService, {
  startSession: () => Effect.die("not implemented"),
  sendTurn: () => Effect.die("not implemented"),
  interruptTurn: () => Effect.die("not implemented"),
  respondToRequest: () => Effect.die("not implemented"),
  respondToUserInput: () => Effect.die("not implemented"),
  stopSession: () => Effect.die("not implemented"),
  listSessions: () => Effect.succeed([]),
  getCapabilities: () => Effect.die("not implemented"),
  rollbackConversation: () => Effect.die("not implemented"),
  streamEvents: Stream.empty,
} as never);

describe("OrchestrationReactor", () => {
  let runtime: ManagedRuntime.ManagedRuntime<OrchestrationReactor, never> | null = null;

  afterEach(async () => {
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
  });

  it("starts provider ingestion, provider command, and checkpoint reactors", async () => {
    const started: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationReactor, makeOrchestrationReactor).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: Effect.sync(() => {
              started.push("provider-runtime-ingestion");
            }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: Effect.sync(() => {
              started.push("provider-command-reactor");
            }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: Effect.sync(() => {
              started.push("checkpoint-reactor");
            }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(stubOrchestrationEngine),
        Layer.provideMerge(stubProviderService),
      ),
    );

    const reactor = await runtime.runPromise(Effect.service(OrchestrationReactor));
    const scope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(reactor.start.pipe(Scope.provide(scope)));

    expect(started).toEqual([
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
    ]);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
