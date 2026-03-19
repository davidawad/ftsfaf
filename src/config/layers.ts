import { Context, Effect, Layer } from "effect";
import type { FtsfafConfig, Skill, AgentConfig, Workflow } from "./schema.js";
import {
  loadAllConfigs,
  type ConfigLoadError,
  type ValidationError,
  type EnvVarError,
} from "./loader.js";

/**
 * Service tags for dependency injection
 */
export class FtsfafConfigService extends Context.Tag("FtsfafConfigService")<
  FtsfafConfigService,
  FtsfafConfig
>() {}

export class SkillsService extends Context.Tag("SkillsService")<
  SkillsService,
  Map<string, Skill>
>() {}

export class AgentsService extends Context.Tag("AgentsService")<
  AgentsService,
  Map<string, AgentConfig>
>() {}

export class WorkflowsService extends Context.Tag("WorkflowsService")<
  WorkflowsService,
  Map<string, Workflow>
>() {}

/**
 * Combined config layer that loads all configurations
 */
export const ConfigLayer = (
  configPath?: string
): Layer.Layer<
  | FtsfafConfigService
  | SkillsService
  | AgentsService
  | WorkflowsService,
  ConfigLoadError | ValidationError | EnvVarError
> =>
  Layer.effect(
    FtsfafConfigService,
    Effect.gen(function* (_) {
      const configs = yield* _(loadAllConfigs(configPath));

      // Provide all services
      yield* _(
        Effect.provide(
          Effect.unit,
          Layer.mergeAll(
            Layer.succeed(FtsfafConfigService, configs.config),
            Layer.succeed(SkillsService, configs.skills),
            Layer.succeed(AgentsService, configs.agents),
            Layer.succeed(WorkflowsService, configs.workflows)
          )
        )
      );

      return configs.config;
    })
  ).pipe(
    Layer.provideMerge(
      Layer.effect(
        SkillsService,
        Effect.gen(function* (_) {
          const configs = yield* _(loadAllConfigs(configPath));
          return configs.skills;
        })
      )
    ),
    Layer.provideMerge(
      Layer.effect(
        AgentsService,
        Effect.gen(function* (_) {
          const configs = yield* _(loadAllConfigs(configPath));
          return configs.agents;
        })
      )
    ),
    Layer.provideMerge(
      Layer.effect(
        WorkflowsService,
        Effect.gen(function* (_) {
          const configs = yield* _(loadAllConfigs(configPath));
          return configs.workflows;
        })
      )
    )
  );

/**
 * Simplified layer that loads all configs once
 */
export const makeConfigLayer = (
  configPath?: string
): Layer.Layer<
  | FtsfafConfigService
  | SkillsService
  | AgentsService
  | WorkflowsService,
  ConfigLoadError | ValidationError | EnvVarError
> =>
  Layer.unwrapEffect(
    Effect.gen(function* (_) {
      const configs = yield* _(loadAllConfigs(configPath));

      return Layer.mergeAll(
        Layer.succeed(FtsfafConfigService, configs.config),
        Layer.succeed(SkillsService, configs.skills),
        Layer.succeed(AgentsService, configs.agents),
        Layer.succeed(WorkflowsService, configs.workflows)
      );
    })
  );

/**
 * Helper to access all config services
 */
export const getAllConfigs = Effect.gen(function* (_) {
  const config = yield* _(FtsfafConfigService);
  const skills = yield* _(SkillsService);
  const agents = yield* _(AgentsService);
  const workflows = yield* _(WorkflowsService);

  return { config, skills, agents, workflows };
});
