import { CommandId, ThreadId, type OrchestrationThread } from "@helios-dev/contracts";
import { Effect, Layer } from "effect";

import {
  OrchestrationReactor,
  type OrchestrationReactorShape,
} from "../Services/OrchestrationReactor.ts";
import { CheckpointReactor } from "../Services/CheckpointReactor.ts";
import { ProviderCommandReactor } from "../Services/ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionService } from "../Services/ProviderRuntimeIngestion.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";

export const makeOrchestrationReactor = Effect.gen(function* () {
  const providerRuntimeIngestion = yield* ProviderRuntimeIngestionService;
  const providerCommandReactor = yield* ProviderCommandReactor;
  const checkpointReactor = yield* CheckpointReactor;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const providerService = yield* ProviderService;

  /**
   * On startup, detect threads whose session is stuck in "running" state with
   * an active turn that no longer has a backing provider process (e.g. because
   * the app was force-quit or crashed before the turn-completion event could be
   * projected). For each stuck thread we dispatch a `thread.session.set`
   * command to transition the session back to "ready" with no active turn,
   * unblocking the UI.
   */
  const recoverStuckSessions = Effect.gen(function* () {
    const readModel = yield* orchestrationEngine.getReadModel();

    const stuckThreads = readModel.threads.filter(
      (thread: OrchestrationThread) =>
        thread.session !== null &&
        thread.session.status === "running" &&
        thread.session.activeTurnId !== null,
    );

    if (stuckThreads.length === 0) {
      return;
    }

    yield* Effect.log(
      `startup recovery: found ${stuckThreads.length} thread(s) with running sessions, checking provider liveness`,
    );

    // Collect all live session thread IDs for a fast lookup.
    const liveSessionThreadIds = yield* providerService
      .listSessions()
      .pipe(Effect.map((sessions) => new Set(sessions.map((s) => s.threadId))));

    for (const thread of stuckThreads) {
      if (liveSessionThreadIds.has(thread.id)) {
        // Provider session is still alive – nothing to recover.
        continue;
      }

      yield* Effect.log(
        `startup recovery: resetting stuck session for thread ${thread.id}`,
      );

      const now = new Date().toISOString();
      yield* orchestrationEngine
        .dispatch({
          type: "thread.session.set",
          commandId: CommandId.makeUnsafe(
            `recovery:stuck-session:${thread.id}:${crypto.randomUUID()}`,
          ),
          threadId: ThreadId.makeUnsafe(thread.id),
          session: {
            threadId: ThreadId.makeUnsafe(thread.id),
            status: "ready",
            providerName: thread.session!.providerName,
            runtimeMode: thread.session!.runtimeMode,
            activeTurnId: null,
            lastError: null,
            updatedAt: now,
          },
          createdAt: now,
        })
        .pipe(
          Effect.catch(() =>
            Effect.logWarning(
              `startup recovery: failed to reset stuck session for thread ${thread.id}`,
            ),
          ),
        );
    }
  });

  const start: OrchestrationReactorShape["start"] = Effect.gen(function* () {
    yield* providerRuntimeIngestion.start;
    yield* providerCommandReactor.start;
    yield* checkpointReactor.start;

    // After all reactors are ready, recover any sessions left stuck by a
    // previous ungraceful shutdown.
    yield* recoverStuckSessions;
  });

  return {
    start,
  } satisfies OrchestrationReactorShape;
});

export const OrchestrationReactorLive = Layer.effect(
  OrchestrationReactor,
  makeOrchestrationReactor,
);
