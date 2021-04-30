import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';

export abstract class Listener<T> implements Definition<Listener<T>> {
  definition = Listener;
  constructor(public key: T) {}
  abstract handle(subject: T, container: ServiceLocator): void;
}

export abstract class EventSink {
  abstract emit<T>(subject: T): void;
}

export class EventBus implements EventSink {
  private listeners: Map<any, Listener<any>[]> = new Map();
  constructor(private container: ServiceLocator, definitions: any[]) {
    for (const definition of definitions) {
      if (definition instanceof Listener) {
        const handlers = this.listeners.get(definition.key) || [];
        handlers.push(definition);
        this.listeners.set(definition.key, handlers);
      }
    }
  }
  emit<T>(subject: T): void {
    this.listeners
      .get((subject as any).constructor as any)
      ?.map((handler) => handler.handle(subject, this.container));
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types
type AbstractClass<T = any> = Function & { prototype: T };
type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

type AllInstanceType<T extends AbstractClass[]> = {
  [K in keyof T]: T[K] extends { prototype: infer V } ? V : never;
};

type MethodOf<
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

type FunctionOf<
  TSubjectType extends Constructor,
  TExtrasType extends AbstractClass[],
  TSubject = InstanceType<TSubjectType>,
  TExtras extends any[] = AllInstanceType<TExtrasType>
> = (subject: TSubject, ...args: TExtras) => void;

export class EventListenerBuilder<T extends ClassLike<T>, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = [] as any) {}

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }

  do(target: FunctionOf<T, A>): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T, A>>(target: C, method: M): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T, A>>(
    target: C | FunctionOf<T, A>,
    method?: M,
  ): Listener<T> {
    return method
      ? new ClassEventListener(this.key, this.args, target as C, method)
      : new FunctionEventListener(this.key, this.args, target as FunctionOf<T, A>);
  }
}

export class ClassEventListener<
  T extends ClassLike<T>,
  A extends AbstractClass[],
  V extends Constructor,
  M extends MethodOf<V, T, A>
> extends Listener<T> {
  constructor(public key: T, public args: A, private listenerClass: V, private listenerMethod: M) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator): void {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const handler = container.get(this.listenerClass);
    handler[this.listenerMethod](subject, ...args);
  }
}

export class FunctionEventListener<
  T extends ClassLike<T>,
  A extends AbstractClass[]
> extends Listener<T> {
  constructor(public key: T, public args: A, private handler: FunctionOf<T, A>) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator): void {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    this.handler(subject, ...args);
  }
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}
