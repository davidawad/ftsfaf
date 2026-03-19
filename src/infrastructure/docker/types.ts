/**
 * Docker Infrastructure Types
 */

export interface ContainerConfig {
  readonly image: string;
  readonly name: string;
  readonly env?: Record<string, string>;
  readonly ports?: Record<string, string>; // containerPort -> hostPort
  readonly volumes?: Record<string, string>; // hostPath -> containerPath
}

export interface ContainerInfo {
  readonly id: string;
  readonly name: string;
  readonly status: "running" | "stopped" | "created" | "exited";
  readonly ports: Record<string, string>;
}

export interface ContainerStats {
  readonly cpuUsage: number;
  readonly memoryUsage: number;
  readonly networkRx: number;
  readonly networkTx: number;
}
