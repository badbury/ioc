export type Definition<T = unknown> = {
  definition: { prototype: T };
  constructor: { prototype: T };
};

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

export type EventListener<T = unknown> = (param: T) => unknown;

export interface EventStream<T = unknown> {
  on(listener: EventListener<T>): void;
  off(listener: EventListener<T>): void;
}

export interface Event<I = unknown, T = unknown> extends EventStream<T> {
  (param: I): unknown;
}

export abstract class EventSink {
  abstract emit<T>(subject: T): unknown;
}

export interface DynamicEventSink {
  [method: string]: <T>(param: T) => unknown;
  process: <T>(param: T) => unknown;
  dispatch: <T>(param: T) => unknown;
  do: <T>(param: T) => unknown;
  notify: <T>(param: T) => unknown;
  add: <T>(param: T) => unknown;
  <T>(param: T): unknown;
}

export abstract class DynamicEventSink extends EventSink {}
