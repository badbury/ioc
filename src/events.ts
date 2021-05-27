import { ServiceLocator } from './dependency-injection';
import { Dispatcher } from './events-dispatchers';
import { EventListenerBuilder, Listener } from './events-listeners';
import { ClassLike, Newable } from './type-utils';

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

const defaultDispatcher: Dispatcher<unknown> = {
  key: null,
  definition: Dispatcher,
  handle(subject, container, sink, listeners) {
    return listeners.map((handler) => handler.handle(subject, container, sink));
  },
};

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface EventBus extends DynamicEventSink {}

export class EventBus extends CallableClass {
  private listeners: Map<unknown, Listener<unknown>[]> = new Map();
  private dispatchers: Map<unknown, Dispatcher<unknown>> = new Map();

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
    const dispatcher = this.dispatchers.get(constructor) || defaultDispatcher;
    const listeners = this.listeners.get(constructor) || [];
    return dispatcher.handle(subject, this.container, this, listeners);
  }
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}

function hasConstructor<X>(obj: X): obj is X & { constructor: new (...args: unknown[]) => X } {
  return typeof obj === 'object' && 'constructor' in obj;
}
