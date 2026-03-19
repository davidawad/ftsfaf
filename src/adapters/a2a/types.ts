/**
 * A2A Protocol Types
 * Based on the Agent2Agent (A2A) specification
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Record<string, unknown> | readonly unknown[];
  readonly id: string | number;
}

/**
 * JSON-RPC 2.0 Response (Success)
 */
export interface JsonRpcSuccess {
  readonly jsonrpc: "2.0";
  readonly result: unknown;
  readonly id: string | number;
}

/**
 * JSON-RPC 2.0 Response (Error)
 */
export interface JsonRpcError {
  readonly jsonrpc: "2.0";
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
  readonly id: string | number;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/**
 * A2A Message format
 */
export interface A2AMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * A2A Request parameters for the `generate` method
 */
export interface A2AGenerateParams {
  readonly messages: readonly A2AMessage[];
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly stream?: boolean;
}

/**
 * A2A Response for the `generate` method
 */
export interface A2AGenerateResponse {
  readonly content: string;
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

/**
 * A2A Agent capabilities
 */
export interface A2ACapabilities {
  readonly methods: readonly string[];
  readonly version: string;
  readonly name?: string;
  readonly description?: string;
}

/**
 * A2A Message Send Parameters
 */
export interface A2AMessageSendParams {
  readonly message: {
    readonly role: "user" | "agent";
    readonly parts: readonly {
      readonly type: "text";
      readonly content: string;
    }[];
  };
  readonly taskId?: string;
  readonly contextId?: string;
}

/**
 * A2A Task Response
 */
export interface A2ATask {
  readonly id: string;
  readonly contextId: string;
  readonly status: {
    readonly state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
    readonly message?: {
      readonly role: "agent";
      readonly parts: readonly {
        readonly type: "text";
        readonly content: string;
      }[];
    };
    readonly timestamp: string;
  };
  readonly artifacts?: readonly {
    readonly parts: readonly {
      readonly type: "text";
      readonly content: string;
    }[];
  }[];
  readonly kind: "task";
}

/**
 * A2A Task Query Parameters
 */
export interface A2ATaskQueryParams {
  readonly id: string;
  readonly historyLength?: number;
}
