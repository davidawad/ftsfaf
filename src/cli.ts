#!/usr/bin/env node

import { Command } from "commander";
import { Effect } from "effect";
import * as path from "path";
import * as fs from "fs/promises";
import { makeDatabaseLayer, DatabaseService } from "./runtime/db/layer.js";
import { loadAllConfigs, loadTask } from "./config/loader.js";
import { executeWorkflow } from "./runtime/executor.js";
import { bootstrapAdapters } from "./adapters/bootstrap.js";
import { logger } from "./utils/logger.js";
import { SANDBOX_BASE_PATH } from "./utils/constants.js";

const program = new Command();

program
  .name("ftsfaf")
  .description("Fast Task Sequencing For AI Agents - Workflow orchestration engine")
  .version("0.1.0");

program
  .command("server")
  .description("Start the workflow engine API server")
  .argument("[dir]", "Directory containing ftsfaf.config.json (defaults to current directory)")
  .option("--log-level <level>", "Log level (trace, debug, info, warn, error)", "info")
  .action(async (dir: string = ".", options: { logLevel: string }) => {
    // Set log level
    if (options.logLevel) {
      process.env.LOG_LEVEL = options.logLevel;
    }

    const workDir = path.resolve(dir);
    const configPath = path.join(workDir, "ftsfaf.config.json");

    logger.info({ workDir, configPath }, "Starting ftsfaf Engine API Server");

    try {
      // Change to the workflow directory
      process.chdir(workDir);

      // Bootstrap adapters
      logger.info("Bootstrapping adapters");
      bootstrapAdapters();
      
      // Load config to get server port
      const configResult = await Effect.runPromise(
        loadAllConfigs("./ftsfaf.config.json")
      );
      const { config } = configResult;

      // Initialize server context
      const { initServerContext } = await import("./server/context.js");
      initServerContext(workDir);

      // Initialize database
      const { initDb } = await import("./runtime/db/init.js");
      await Effect.runPromise(initDb());

      // Start server
      const { startServer } = await import("./server/index.js");
      const serverConfig = startServer(config.server.port);

      logger.info({ port: config.server.port }, "Server started successfully");

      // Start Bun server
      const Bun = (globalThis as any).Bun;
      if (Bun && Bun.serve) {
        Bun.serve(serverConfig);
      } else {
        logger.error("Bun runtime not detected. Please run with Bun.");
        process.exit(1);
      }
    } catch (error) {
      logger.fatal({ error }, "Failed to start server");
      process.exit(1);
    }
  });

program
  .command("run")
  .description("Submit a task to the workflow engine")
  .argument("<dir>", "Directory containing ftsfaf.config.json and workflow files")
  .requiredOption("--task <input>", "Task input: either a file path (e.g., task.json) or a string (e.g., 'write a poem about sunsets')")
  .option("--workflow <id>", "Workflow ID to execute (defaults to first found)")
  .option("--mock", "Use mock agents instead of real ones")
  .option("--log-level <level>", "Log level (trace, debug, info, warn, error)", "info")
  .option("--engine-url <url>", "Engine API URL (overrides config)")
  .option("--wait", "Wait for task completion and stream results")
  .action(async (dir: string, options: { task: string; workflow?: string; mock: boolean; logLevel: string; engineUrl?: string; wait?: boolean }) => {
    // Set log level from CLI option
    if (options.logLevel) {
      process.env.LOG_LEVEL = options.logLevel;
    }

    const workDir = path.resolve(dir);
    const configPath = path.join(workDir, "ftsfaf.config.json");

    try {
      // Load config to get engine URL
      process.chdir(workDir);
      const configResult = await Effect.runPromise(
        loadAllConfigs("./ftsfaf.config.json")
      );
      const { config, workflows } = configResult;

      // Determine engine URL
      const engineUrl = options.engineUrl || config.engine?.url || `http://localhost:${config.server.port}`;
      
      logger.info({
        engineUrl,
        taskInput: options.task,
        workflow: options.workflow,
      }, "Submitting task to engine");

      // Determine workflow ID
      const workflowId = options.workflow ?? workflows.keys().next().value;
      if (!workflowId) {
        logger.error("No workflows found");
        process.exit(1);
      }

      // Prepare task payload
      const taskPayload = {
        workflow: workflowId,
        input: options.task,
        metadata: {
          source: 'cli',
          createdAt: new Date().toISOString(),
        },
      };

      // Submit task to engine
      const response = await fetch(`${engineUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskPayload),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error({ error, status: response.status }, "Failed to submit task");
        process.exit(1);
      }

      const result = await response.json();
      logger.info(result, "Task submitted successfully");

      // If --wait flag, poll for completion
      if (options.wait) {
        logger.info("Waiting for task completion...");
        const taskId = result.task_id;
        
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const statusResponse = await fetch(`${engineUrl}/tasks/${taskId}`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            logger.info({ status: status.status }, "Task status");
            
            if (status.status === 'completed' || status.status === 'failed') {
              // Get full run details
              const runResponse = await fetch(`${engineUrl}/runs/${status.run_id}`);
              if (runResponse.ok) {
                const runDetails = await runResponse.json();
                logger.info(runDetails, "Task completed");
              }
              break;
            }
          }
        }
      }

    } catch (error) {
      logger.fatal({ error }, "Fatal error");
      if (error instanceof Error) {
        logger.fatal({ message: error.message, stack: error.stack }, "Error details");
      }
      process.exit(1);
    }
  });

program.parse();
