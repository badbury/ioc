import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';

export abstract class Listener<T> implements Definition<Listener<T>> {
  definition = Listener;
  constructor(public key: T) {}
  abstract handle(subject: T, container: ServiceLocator): unknown;
}

export abstract class Dispatcher<T> implements Definition<Dispatcher<T>> {
  definition = Dispatcher;
  constructor(public key: T) {}
  abstract handle(subject: T, container: ServiceLocator, listeners: Listener<T>[]): unknown;
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
  <T>(param: T): unknown;
}
export abstract class DynamicEventSink extends EventSink {}

function CallableInstance(this: typeof CallableInstance, property: string) {
  const func = this.constructor.prototype[property];
  const apply = function (...args: any[]) {
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

const defaultDispatcher: Dispatcher<unknown> = {
  key: null,
  definition: Dispatcher,
  handle(subject, container, listeners) {
    return listeners.map((handler) => handler.handle(subject, container));
  },
};

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface EventBus extends DynamicEventSink {}

export class EventBus extends (CallableInstance as any) {
  private listeners: Map<unknown, Listener<unknown>[]> = new Map();
  private dispatchers: Map<unknown, Dispatcher<unknown>> = new Map();

  constructor(private container: ServiceLocator, definitions: any[]) {
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
      get(target: EventBus, key: any) {
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
    return (new Proxy(this, handler) as unknown) as EventBus;
  }

  emit<T>(subject: T): unknown {
    const constructor = (subject as any).constructor as any;
    const dispatcher = this.dispatchers.get(constructor) || defaultDispatcher;
    const listeners = this.listeners.get(constructor) || [];
    return dispatcher.handle(subject, this.container, listeners);
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types
type AbstractClass<T = any> = Function & { prototype: T };
type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

type AllInstanceType<T extends AbstractClass[]> = {
  [K in keyof T]: T[K] extends { prototype: infer V } ? V : never;
};

type ListenerMethod<
  TClassType extends Constructor,
  TSubjectType extends Constructor,
  TExtrasType extends AbstractClass[],
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>,
  TExtras = AllInstanceType<TExtrasType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (arg: infer U, ...extras: infer E) => any
    ? U extends TSubject
      ? E extends TExtras
        ? TProperty
        : never
      : never
    : never;
}[keyof TClass];

type ListenerFunction<TSubjectType extends Constructor, TExtrasType extends AbstractClass[]> = (
  subject: InstanceType<TSubjectType>,
  ...args: AllInstanceType<TExtrasType>
) => unknown;

export type ListnerFunctions<T extends ClassLike<T>> = ((subject: InstanceType<T>) => unknown)[];

type DispatchMethod<
  TClassType extends Constructor,
  TSubjectType extends Constructor,
  TExtrasType extends AbstractClass[],
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>,
  TExtras = AllInstanceType<TExtrasType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (
    arg: infer U,
    listeners: ListnerFunctions<infer X>,
    ...extras: infer E
  ) => any
    ? U extends TSubject
      ? X extends TSubject
        ? E extends TExtras
          ? TProperty
          : never
        : never
      : never
    : never;
}[keyof TClass];

type DispatchFunction<T extends ClassLike<T>, A extends AbstractClass[]> = (
  subject: InstanceType<T>,
  listeners: ListnerFunctions<T>,
  ...extras: AllInstanceType<A>
) => unknown;

export class EventListenerBuilder<T extends ClassLike<T>, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = [] as any) {}

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }

  do(target: ListenerFunction<T, A>): Listener<T>;
  do<C extends Constructor, M extends ListenerMethod<C, T, A>>(target: C, method: M): Listener<T>;
  do<C extends Constructor, M extends ListenerMethod<C, T, A>>(
    target: C | ListenerFunction<T, A>,
    method?: M,
  ): Listener<T> {
    return method
      ? new ClassEventListener(this.key, this.args, target as C, method)
      : new FunctionEventListener(this.key, this.args, target as ListenerFunction<T, A>);
  }

  dispatchWith(target: DispatchFunction<T, A>): Dispatcher<T>;
  dispatchWith<C extends Constructor, M extends DispatchMethod<C, T, A>>(
    target: C,
    method: M,
  ): Dispatcher<T>;
  dispatchWith<C extends Constructor, M extends DispatchMethod<C, T, A>>(
    target: C | DispatchFunction<T, A>,
    method?: M,
  ): Dispatcher<T> {
    return method
      ? new ClassEventDispatcher(this.key, this.args, target as C, method)
      : new FunctionEventDispatcher(this.key, this.args, target as DispatchFunction<T, A>);
  }
}

export class ClassEventListener<
  T extends ClassLike<T>,
  A extends AbstractClass[],
  V extends Constructor,
  M extends ListenerMethod<V, T, A>
> extends Listener<T> {
  constructor(public key: T, public args: A, private listenerClass: V, private listenerMethod: M) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const handler = container.get(this.listenerClass);
    return handler[this.listenerMethod](subject, ...args);
  }
}

export class FunctionEventListener<
  T extends ClassLike<T>,
  A extends AbstractClass[]
> extends Listener<T> {
  constructor(public key: T, public args: A, private handler: ListenerFunction<T, A>) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    return this.handler(subject, ...args);
  }
}

export class ClassEventDispatcher<
  T extends ClassLike<T>,
  A extends AbstractClass[],
  V extends Constructor,
  M extends DispatchMethod<V, T, A>
> extends Dispatcher<T> {
  constructor(public key: T, public args: A, private listenerClass: V, private listenerMethod: M) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator, listeners: Listener<T>[]): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const listenerFunctions: ListnerFunctions<T> = listeners.map((listener) => {
      return (subject: InstanceType<T>): unknown => listener.handle(subject, container);
    });
    const handler = container.get(this.listenerClass);
    return handler[this.listenerMethod](subject, listenerFunctions, ...args);
  }
}

export class FunctionEventDispatcher<
  T extends ClassLike<T>,
  A extends AbstractClass[]
> extends Dispatcher<T> {
  constructor(public key: T, public args: A, private handler: DispatchFunction<T, A>) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator, listeners: Listener<T>[]): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const listenerFunctions: ListnerFunctions<T> = listeners.map((listener) => {
      return (subject: InstanceType<T>): unknown => listener.handle(subject, container);
    });
    return this.handler(subject, listenerFunctions, ...args);
  }
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}
