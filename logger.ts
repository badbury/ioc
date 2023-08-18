import {
  Definition,
  Log,
  LogDebug,
  LogError,
  LogFunction,
  Logger,
  LogInfo,
  LogLevel,
  LogLevelOption,
  LogPresenter,
  LogSubject,
  LogTrace,
  LogWarn,
} from "./contracts.ts";
import { bind } from "./injector.ts";

export class LoggerModule {
  register(): Definition[] {
    return [
      bind(LogLevel).factory(() => Deno.env.get("LOG_LEVEL") || "info"),
      bind(Logger)
        .use(LogLevel)
        .factory((limit) => makeLogger(limit as LogLevelOption)),
      bind(Log)
        .use(Logger)
        .factory(
          (logger): Log =>
          (
            level: string,
            message: string | Record<string, unknown>,
            context?: Record<string, unknown>,
          ) => {
            if (level in logger) {
              logger[level as keyof Logger](
                message as string,
                context as Record<string, unknown>,
              );
            }
          },
        ),
      bind(LogError)
        .use(Logger)
        .factory((logger) => logger.error.bind(logger)),
      bind(LogWarn)
        .use(Logger)
        .factory((logger) => logger.warn.bind(logger)),
      bind(LogInfo)
        .use(Logger)
        .factory((logger) => logger.info.bind(logger)),
      bind(LogDebug)
        .use(Logger)
        .factory((logger) => logger.debug.bind(logger)),
      bind(LogTrace)
        .use(Logger)
        .factory((logger) => logger.trace.bind(logger)),
    ];
  }
}

function makeLogger(
  logLimit: LogLevelOption,
  presenter?: LogPresenter,
): Logger {
  const logger = presenter ||
    (Deno.env.get("NODE_ENV") === "development" ? consoleLogger : jsonLogger);
  const log = (level: LogLevelOption): LogFunction =>
  (
    message: string | Record<string, unknown>,
    context?: Record<string, unknown>,
  ) => {
    if (!shouldLog(logLimit, level)) {
      return;
    }
    const subject =
      (typeof message === "string"
        ? { level, message, context }
        : { level, context: message }) as LogSubject;
    logger(subject);
  };
  return {
    error: log("error"),
    warn: log("warn"),
    info: log("info"),
    debug: log("debug"),
    trace: log("trace"),
  };
}

function shouldLog(logLimit: LogLevelOption, logLevel: LogLevelOption) {
  const levels: LogLevelOption[] = ["error", "warn", "info", "debug", "trace"];
  const limitIndex = levels.indexOf(logLimit);
  const levelIndex = levels.indexOf(logLevel);
  if (limitIndex === -1 || levelIndex === -1) {
    return false;
  }
  return levelIndex <= limitIndex;
}

function jsonLogger({ level, message, context }: LogSubject) {
  const body: Record<string, unknown> = {
    level,
    time: Date.now(),
  };
  if (message) {
    body.message = message;
  }
  if (context && context instanceof Array) {
    body.values = context;
  } else if (context && typeof context === "object" && context !== null) {
    if (context.constructor !== Object) {
      body.type = context.constructor.name;
    }
    Object.assign(body, context);
  } else if (context !== undefined) {
    body.value = context;
  }
  const line = JSON.stringify(body);
  console.log(`${line}`);
}

function consoleLogger({ level, message, context }: LogSubject) {
  const now = new Date();
  const pad = (num: number, length = 2) => String(num).padStart(length, "0");
  const time =
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(
      ":",
    ) +
    "." +
    pad(now.getMilliseconds(), 3);
  console.log(`[${level}|${time}]`, ...[message, context].filter((a) => !!a));
}
