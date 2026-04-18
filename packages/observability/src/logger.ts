import { type AppLogger } from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import { readActiveTraceLogContext } from "./trace-headers";

type LogContext = Record<string, unknown>;
type LogLevel = AppConfig["logLevel"];

const sensitiveFieldPattern = /secret|token|password|authorization|key/i;

function sanitizeLogValue(value: unknown, secretMask: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, secretMask));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
      ...(value.cause !== undefined ? { cause: sanitizeLogValue(value.cause, secretMask) } : {}),
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => {
      if (sensitiveFieldPattern.test(key)) {
        return [key, secretMask];
      }

      return [key, sanitizeLogValue(currentValue, secretMask)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}

function sanitizeLogObject(
  value: Record<string, unknown>,
  secretMask: string,
): Record<string, unknown> {
  const sanitized = sanitizeLogValue(value, secretMask);

  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

function isoTimestamp(): string {
  return `,"timestamp":"${new Date().toISOString()}"`;
}

function createLogEntry(context?: LogContext): LogContext | undefined {
  const traceContext = readActiveTraceLogContext();

  if (!traceContext && !context) {
    return undefined;
  }

  return {
    ...(traceContext ? { trace: traceContext } : {}),
    ...(context ? { context } : {}),
  };
}

export function createPinoLoggerOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.logLevel,
    messageKey: "message",
    errorKey: "error",
    timestamp: isoTimestamp,
    formatters: {
      bindings(bindings) {
        return {
          pid: bindings.pid,
          hostname: bindings.hostname,
          app: config.appName,
          version: config.appVersion,
          environment: config.environment,
          service: config.otelServiceName,
        };
      },
      level(label) {
        return { level: label };
      },
      log(object) {
        return sanitizeLogObject(object, config.secretMask);
      },
    },
  };
}

export function createPinoLogger(config: AppConfig, destination?: DestinationStream): Logger {
  const options = createPinoLoggerOptions(config);

  return destination ? pino(options, destination) : pino(options);
}

export class PinoAppLogger implements AppLogger {
  constructor(private readonly logger: Logger) {}

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const entry = createLogEntry(context);

    switch (level) {
      case "debug":
        entry ? this.logger.debug(entry, message) : this.logger.debug(message);
        return;
      case "info":
        entry ? this.logger.info(entry, message) : this.logger.info(message);
        return;
      case "warn":
        entry ? this.logger.warn(entry, message) : this.logger.warn(message);
        return;
      case "error":
        entry ? this.logger.error(entry, message) : this.logger.error(message);
        return;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write("error", message, context);
  }
}

export function createLogger(config: AppConfig, destination?: DestinationStream): AppLogger {
  return new PinoAppLogger(createPinoLogger(config, destination));
}
