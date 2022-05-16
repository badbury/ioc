export type Definition<T = unknown> = {
  definition: { prototype: T };
  constructor: { prototype: T };
};

// Injector

export abstract class ServiceLocator {
  abstract get<T extends { prototype: unknown }>(type: T): T['prototype'];
}

export abstract class ResolverMiddleware<T> {
  abstract resolve(container: ServiceLocator, next: () => T): T;
}

export interface Resolveable<T> {
  resolveWithMiddleware(container: ServiceLocator): T;
}

export abstract class ResolverSink {
  abstract register(resolver: Resolveable<unknown>): void;
}

// Events

export type EventListener<T = unknown> = (param: T) => unknown;

export interface EventStream<T = unknown> {
  on(listener: EventListener<T>): void;
  off(listener: EventListener<T>): void;
}

export interface Event<I = unknown, T = unknown> extends EventStream<T> {
  (param: I): unknown;
}

export interface EmitEvent {
  <T>(param: T): unknown;
}
export abstract class EmitEvent {}

export abstract class EventSink {
  abstract emit<T>(subject: T): unknown;
}

// Logging

export abstract class LogLevel extends String {}
export type ObjectLike = Record<string, unknown> | { constructor: { name: string } };
export type LogLevelOption = keyof Logger;

export interface Log {
  (level: LogLevelOption, message: string): void;
  (level: LogLevelOption, context: ObjectLike): void;
  (level: LogLevelOption, message: string, context: ObjectLike): void;
}
export abstract class Log {}

export interface LogFunction {
  (message: string): void;
  (context: ObjectLike): void;
  (message: string, context: ObjectLike): void;
}
export abstract class LogFunction {}
export abstract class LogError extends LogFunction {}
export abstract class LogWarn extends LogFunction {}
export abstract class LogInfo extends LogFunction {}
export abstract class LogDebug extends LogFunction {}
export abstract class LogTrace extends LogFunction {}

export abstract class Logger {
  abstract error: LogError;
  abstract warn: LogWarn;
  abstract info: LogInfo;
  abstract debug: LogDebug;
  abstract trace: LogTrace;
}

export type LogSubject = { level: string; message?: string; context?: Record<string, unknown> };
export type LogPresenter = (subject: LogSubject) => void;
