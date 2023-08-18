import { Callable, callableSetter } from "./callable/callable.ts";
import {
  Definition,
  Event,
  EventListener,
  EventSink,
  EventStream,
  ServiceLocator,
} from "./contracts.ts";
import { CallableSetter } from "./mod.ts";
import { AbstractClass, ClassLike, Newable } from "./type_utils.ts";

type EventDispatcher = Pick<AnyDispatcher, "dispatch">;
export type Identity<T> = T;
type Flatten<T extends object> = Identity<{ [k in keyof T]: T[k] }>;

type AnyDispatcher = Dispatcher<
  new () => unknown,
  Callable<[unknown, ListnerFunctions<new () => unknown>]>
>;
type AnyListener = Listener<new () => unknown, Callable<[unknown]>>;

const defaultDispatcher: EventDispatcher = {
  dispatch(subject, container, sink, listeners) {
    return Promise.all(
      listeners.map((listener) => {
        return listener.handle(subject, container, sink);
      }),
    );
  },
};

// deno-lint-ignore no-empty-interface
export interface EventBus extends EventSink {}

export class EventBus {
  private listeners: Map<unknown, AnyListener[]> = new Map();
  private dispatchers: Map<unknown, AnyDispatcher> = new Map();

  constructor(private container: ServiceLocator, definitions: unknown[]) {
    for (const definition of definitions) {
      if (definition instanceof Listener) {
        const handlers = this.listeners.get(definition.key) || [];
        handlers.push(definition);
        this.listeners.set(definition.key, handlers);
      }
      if (definition instanceof Dispatcher) {
        this.dispatchers.set(definition.key, definition);
      }
    }
  }

  emit<T>(subject: T): unknown {
    const constructor = hasConstructor(subject) && subject.constructor;
    const dispatcher: EventDispatcher = this.dispatchers.get(constructor) ||
      defaultDispatcher;
    const listeners = this.listeners.get(constructor) || [];
    return dispatcher.dispatch(subject, this.container, this, listeners);
  }
}

export class Dispatcher<
  T extends Newable,
  C extends Callable<[InstanceType<T>, ListnerFunctions<T>]>,
> implements Definition<Dispatcher<T, C>> {
  definition = Dispatcher;
  constructor(public key: T, private callable: C) {}

  public dispatch(
    subject: InstanceType<T>,
    container: ServiceLocator,
    sink: EventSink,
    listeners: Listener<InstanceType<T>, Callable<[InstanceType<T>]>>[],
  ): unknown {
    const listenerFunctions: ListnerFunctions<T> = listeners.map((listener) => {
      return (subject: InstanceType<T>): unknown =>
        listener.handle(subject, container, sink);
    });
    return this.callable.call([subject, listenerFunctions], container, sink);
  }
}

export type ListnerFunctions<T extends ClassLike> =
  ((subject: InstanceType<T>) => unknown)[];

export class Listener<T extends Newable, C extends Callable<[InstanceType<T>]>>
  implements Definition<Listener<T, C>> {
  definition = Listener;
  constructor(public key: T, private callable: C) {}

  handle(
    subject: InstanceType<T>,
    container: ServiceLocator,
    events: EventSink,
  ): unknown {
    return this.callable.call([subject], container, events);
  }

  emit(): Listener<T, C> {
    return new Listener(this.key, this.callable.emit() as C);
  }
}

export class EventListenerBuilder<
  T extends ClassLike,
  A extends AbstractClass[] = [],
> {
  public do: CallableSetter<
    [InstanceType<T>],
    A,
    unknown,
    Listener<T, Callable<[InstanceType<T>], A, unknown>>
  >;

  public dispatchWith: CallableSetter<
    [InstanceType<T>, ListnerFunctions<T>],
    A,
    unknown,
    Dispatcher<T, Callable<[InstanceType<T>, ListnerFunctions<T>], A, unknown>>
  >;

  constructor(public key: T, public args: A = ([] as unknown) as A) {
    this.do = callableSetter()
      .withPassedArgs<[InstanceType<T>]>()
      .withContainerArgs(this.args)
      .map((callable) => new Listener(this.key, callable));

    this.dispatchWith = callableSetter()
      .withPassedArgs<[InstanceType<T>, ListnerFunctions<T>]>()
      .withContainerArgs(this.args)
      .map((callable) => new Dispatcher(this.key, callable));
  }

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }
}

export function on<T extends ClassLike>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}

export function emitUnknownValue(value: unknown, sink: EventSink): unknown {
  if (value instanceof Promise) {
    return value.then((unwrapped) => emitUnknownValue(unwrapped, sink));
  }
  if (Array.isArray(value)) {
    return value.map((unwrapped) => emitUnknownValue(unwrapped, sink));
  }
  if (Symbol.iterator in Object(value)) {
    return emitIterable(value as Iterable<unknown>, sink);
  }
  if (Symbol.asyncIterator in Object(value)) {
    return emitAsyncIterable(value as AsyncIterable<unknown>, sink);
  }
  return sink.emit(value);
}

function emitIterable(value: Iterable<unknown>, sink: EventSink) {
  const results = [];
  for (const item of value) {
    results.push(emitUnknownValue(item, sink));
  }
  return results;
}

async function emitAsyncIterable(
  value: AsyncIterable<unknown>,
  sink: EventSink,
) {
  const results = [];
  for await (const item of value) {
    results.push(emitUnknownValue(item, sink));
  }
  return results;
}

function hasConstructor<X>(
  obj: X,
): obj is X & { constructor: new (...args: unknown[]) => X } {
  return obj && typeof obj === "object" && "constructor" in obj;
}

export type ConstructorOrFactory<I, T> = (new (arg: I) => T) | {
  make(arg: I): T;
};

export function event<I, T>(
  constructor: ConstructorOrFactory<I, T>,
): Event<I, T> {
  const factory = "make" in constructor
    ? constructor.make.bind(constructor)
    : (param: I): T => new constructor(param);

  const emitter = function (param: I): unknown {
    const subject = factory(param);
    for (const listener of emitter.listeners) {
      listener(subject);
    }
    return;
  };

  emitter.listeners = [] as EventListener<T>[];
  emitter.on = (listener: EventListener<T>) => emitter.listeners.push(listener);
  emitter.off = (listener: EventListener<T>) => {
    const index = emitter.listeners.indexOf(listener);
    if (index > -1) {
      emitter.listeners.splice(index, 1);
    }
  };

  return emitter;
}

type ConstructorToEvent<
  T extends ConstructorOrFactory<unknown, unknown>,
> = T extends ConstructorOrFactory<infer A, infer B> ? Event<A, B> : never;

type ConstructorsToEvents<
  T extends Record<string, ConstructorOrFactory<unknown, unknown>>,
> = {
  [P in keyof T]: ConstructorToEvent<T[P]>;
};

export function events<
  T extends Record<string, ConstructorOrFactory<unknown, unknown>>,
>(
  constructorsObject: T,
): ConstructorsToEvents<T> & EventStream {
  const eventsObject: ConstructorsToEvents<T> = Object.entries(
    constructorsObject,
  ).reduce(
    (object, [key, constructor]) => ({ ...object, [key]: event(constructor) }),
    {},
  ) as ConstructorsToEvents<T>;
  const eventsArray = Object.values(eventsObject);
  return {
    ...eventsObject,
    on(listener: EventListener) {
      return eventsArray.forEach((singleEvent) => {
        singleEvent.on(listener);
      });
    },
    off(listener: EventListener) {
      return eventsArray.forEach((singleEvent) => singleEvent.off(listener));
    },
  };
}
