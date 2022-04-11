import { Callable, callableSetter } from './callable/callable';
import { Definition } from './container';
import { ServiceLocator } from './injector';
import { AbstractClass, ClassLike, Newable } from './type-utils';

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

function CallableInstance(this: typeof CallableInstance, property: string) {
  const func = this.constructor.prototype[property];
  const apply = function (...args: unknown[]) {
    return func.apply(apply, args);
  };
  Object.setPrototypeOf(apply, this.constructor.prototype);
  Object.getOwnPropertyNames(func).forEach(function (p) {
    const propertyDescriptor = Object.getOwnPropertyDescriptor(func, p);
    if (propertyDescriptor) {
      Object.defineProperty(apply, p, propertyDescriptor);
    }
  });
  return apply;
}
CallableInstance.prototype = Object.create(Function.prototype);
const CallableClass = (CallableInstance as unknown) as Newable;

type EventDispatcher = Pick<AnyDispatcher, 'dispatch'>;

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

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface EventBus extends DynamicEventSink {}

export class EventBus extends CallableClass {
  private listeners: Map<unknown, AnyListener[]> = new Map();
  private dispatchers: Map<unknown, AnyDispatcher> = new Map();

  constructor(private container: ServiceLocator, definitions: unknown[]) {
    super('emit');
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
    const handler = {
      get(target: EventBus, key: string) {
        const upstream = target[key];
        if (typeof upstream !== 'undefined') {
          return upstream;
        }
        return target.emit.bind(target);
      },
      apply(target: EventBus, _: unknown, args: unknown[]) {
        return target.emit(args[0]);
      },
    };
    return new Proxy(this, handler);
  }

  emit<T>(subject: T): unknown {
    const constructor = hasConstructor(subject) && subject.constructor;
    const dispatcher: EventDispatcher = this.dispatchers.get(constructor) || defaultDispatcher;
    const listeners = this.listeners.get(constructor) || [];
    return dispatcher.dispatch(subject, this.container, this, listeners);
  }
}

export class Dispatcher<
  T extends Newable,
  C extends Callable<[InstanceType<T>, ListnerFunctions<T>]>
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
      return (subject: InstanceType<T>): unknown => listener.handle(subject, container, sink);
    });
    return this.callable.call([subject, listenerFunctions], container, sink);
  }
}

export type ListnerFunctions<T extends ClassLike> = ((subject: InstanceType<T>) => unknown)[];

export class Listener<T extends Newable, C extends Callable<[InstanceType<T>]>>
  implements Definition<Listener<T, C>> {
  definition = Listener;
  constructor(public key: T, private callable: C) {}

  handle(subject: InstanceType<T>, container: ServiceLocator, events: EventSink): unknown {
    return this.callable.call([subject], container, events);
  }

  emit(): Listener<T, C> {
    return new Listener(this.key, this.callable.emit() as C);
  }
}

export class EventListenerBuilder<T extends ClassLike, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = ([] as unknown) as A) {}

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }

  do = callableSetter()
    .withPassedArgs<[InstanceType<T>]>()
    .withContainerArgs(this.args)
    .map((callable) => new Listener(this.key, callable));

  dispatchWith = callableSetter()
    .withPassedArgs<[InstanceType<T>, ListnerFunctions<InstanceType<T>>]>()
    .withContainerArgs(this.args)
    .map((callable) => new Dispatcher(this.key, callable));
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

async function emitAsyncIterable(value: AsyncIterable<unknown>, sink: EventSink) {
  const results = [];
  for await (const item of value) {
    results.push(emitUnknownValue(item, sink));
  }
  return results;
}

function hasConstructor<X>(obj: X): obj is X & { constructor: new (...args: unknown[]) => X } {
  return typeof obj === 'object' && 'constructor' in obj;
}

export type ConstructorOrFactory<I, T> = (new (arg: I) => T) | { make(arg: I): T };

export interface SingleEvent<I, T> {
  (param: I): unknown;
  on(listener: (param: T) => unknown): void;
  off(listener: (param: T) => unknown): void;
}

export function event<I, T>(constructor: ConstructorOrFactory<I, T>): SingleEvent<I, T> {
  const factory =
    'make' in constructor
      ? constructor.make.bind(constructor)
      : (param: I): T => new constructor(param);

  const emitter = function (param: I): unknown {
    const subject = factory(param);
    for (const listener of emitter.listeners) {
      listener(subject);
    }
    return;
  };

  type Listener = (param: T) => unknown;
  emitter.listeners = [] as Listener[];
  emitter.on = (listener: Listener) => emitter.listeners.push(listener);
  emitter.off = (listener: Listener) => {
    const index = emitter.listeners.indexOf(listener);
    if (index > -1) {
      emitter.listeners.splice(index, 1);
    }
  };

  return emitter;
}
