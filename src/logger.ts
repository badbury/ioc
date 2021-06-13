import { Definition } from './container';
import { bind } from './injector';
import { on } from './events';

export class LoggerModule {
  register(): Definition[] {
    return [
      bind(LogLevel).factory(() => process.env.LOG_LEVEL || 'info'),
      bind(Logger)
        .use(LogLevel)
        .factory((limit) => makeLogger(limit as string)),
      bind(LogError)
        .use(Logger)
        .factory((logger) => (object) => logger('error', object)),
      bind(LogWarn)
        .use(Logger)
        .factory((logger) => (object) => logger('warn', object)),
      bind(LogInfo)
        .use(Logger)
        .factory((logger) => (object) => logger('info', object)),
      bind(LogDebug)
        .use(Logger)
        .factory((logger) => (object) => logger('debug', object)),
      on(Log).do(LogInfo),
    ];
  }
}

export class Log {
  constructor(public message: string, context: Record<string, unknown>) {
    Object.assign(this, context);
  }
}

export abstract class LogLevel extends String {}

export interface Logger {
  (level: string, object: { constructor: { name: string } }): void;
}
export abstract class Logger {}

export interface LogFunction {
  (object: { constructor: { name: string } }): void;
}
export abstract class LogFunction {}
export abstract class LogError extends LogFunction {}
export abstract class LogWarn extends LogFunction {}
export abstract class LogInfo extends LogFunction {}
export abstract class LogDebug extends LogFunction {}

function makeLogger(logLimit: string) {
  return (level: string, object: { constructor: { name: string } }) => {
    if (!shouldLog(logLimit, level)) {
      return;
    }
    const logger = process.env.NODE_ENV === 'development' ? devLogger : prodLogger;
    logger(level, object);
  };
}

function shouldLog(logLimit: string, logLevel: string) {
  const levels = ['error', 'warn', 'info', 'debug'];
  const limitIndex = levels.indexOf(logLimit);
  const levelIndex = levels.indexOf(logLevel);
  if (limitIndex === -1 || levelIndex === -1) {
    return false;
  }
  return levelIndex <= limitIndex;
}

function prodLogger(level: string, object: { constructor: { name: string } }) {
  const line = JSON.stringify({
    type: object.constructor.name,
    level,
    time: Date.now(),
    ...object,
  });
  process.stderr.write(`${line}\n`);
}

function devLogger(level: string, object: { constructor: { name: string } }) {
  console.log(`[${level}]`, object);
}
