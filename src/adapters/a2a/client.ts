/**
 * A2A JSON-RPC Client
 * Communicates with A2A-compatible agents over HTTP
 */

import { Effect } from "effect";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  A2AGenerateParams,
  A2AGenerateResponse,
  A2ACapabilities,
  A2AMessageSendParams,
  A2ATask,
  A2ATaskQueryParams,
} from "./types.js";

export class A2AClientError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "A2AClientError";
  }
}

/**
 * A2A Client for JSON-RPC communication
 */
export class A2AClient {
  private requestId = 0;

  constructor(private readonly baseUrl: string) {}

  /**
   * Make a JSON-RPC request
   */
  private makeRequest(
    method: string,
    params?: Record<string, unknown> | readonly unknown[]
  ): Effect.Effect<unknown, A2AClientError> {
    return Effect.gen(this, function* (_) {
      const id = ++this.requestId;

      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        method,
        params,
        id,
      };

      const response = yield* _(
        Effect.tryPromise({
          try: async () => {
            const res = await fetch(this.baseUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(request),
            });

            if (!res.ok) {
              throw new A2AClientError(
                `HTTP ${res.status}: ${res.statusText}`,
                res.status
              );
            }

            return (await res.json()) as JsonRpcResponse;
          },
          catch: (error) => {
            if (error instanceof A2AClientError) {
              return error;
            }
            return new A2AClientError(
              `Request failed: ${String(error)}`,
              undefined,
              error
            );
          },
        })
      );

      // Check for JSON-RPC error
      if ("error" in response) {
        return yield* _(
          Effect.fail(
            new A2AClientError(
              response.error.message,
              response.error.code,
              response.error.data
            )
          )
        );
      }

      return response.result;
    });
  }

  /**
   * Call the `generate` method
   */
  generate(
    params: A2AGenerateParams
  ): Effect.Effect<A2AGenerateResponse, A2AClientError> {
    return Effect.gen(this, function* (_) {
      const result = yield* _(this.makeRequest("generate", params));
      return result as A2AGenerateResponse;
    });
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): Effect.Effect<A2ACapabilities, A2AClientError> {
    return Effect.gen(this, function* (_) {
      const result = yield* _(this.makeRequest("capabilities"));
      return result as A2ACapabilities;
    });
  }

  /**
   * Health check
   */
  ping(): Effect.Effect<boolean, A2AClientError> {
    return Effect.gen(this, function* (_) {
      yield* _(this.makeRequest("ping"));
      return true;
    });
  }

  /**
   * Send a message and create/continue a task
   */
  sendMessage(
    params: A2AMessageSendParams
  ): Effect.Effect<A2ATask, A2AClientError> {
    return Effect.gen(this, function* (_) {
      const result = yield* _(this.makeRequest("message/send", params));
      return result as A2ATask;
    });
  }

  /**
   * Get the current state of a task
   */
  getTask(taskId: string): Effect.Effect<A2ATask, A2AClientError> {
    return Effect.gen(this, function* (_) {
      const params: A2ATaskQueryParams = { id: taskId };
      const result = yield* _(this.makeRequest("tasks/get", params));
      return result as A2ATask;
    });
  }
}

/**
 * Create an A2A client
 */
export const createA2AClient = (baseUrl: string): A2AClient => {
  return new A2AClient(baseUrl);
};
