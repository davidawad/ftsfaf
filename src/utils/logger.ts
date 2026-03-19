import pino from "pino";

/**
 * Get log level from environment or default to 'info'
 */
const getLogLevel = (): pino.Level => {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
  
  if (level && validLevels.includes(level)) {
    return level as pino.Level;
  }
  
  return "info";
};

/**
 * Determine if we should use pretty printing
 * Pretty print in development or when PINO_PRETTY=true
 */
const shouldUsePretty = (): boolean => {
  if (process.env.PINO_PRETTY === "false") return false;
  if (process.env.PINO_PRETTY === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return true;
};

/**
 * Create base logger configuration
 */
const createLogger = (): pino.Logger => {
  const level = getLogLevel();
  
  if (shouldUsePretty()) {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
        },
      },
    });
  }
  
  return pino({
    level,
  });
};

/**
 * Global logger instance
 */
export const logger = createLogger();

/**
 * Create a child logger with additional context
 */
export const createChildLogger = (bindings: pino.Bindings): pino.Logger => {
  return logger.child(bindings);
};
