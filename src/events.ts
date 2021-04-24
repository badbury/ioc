import { ServiceLocator } from './dependency-injection';

export abstract class Listener<T> {
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

type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

type MethodOf<
  TClassType extends Constructor,
  TSubjectType extends Constructor,
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (arg: infer U) => any
    ? U extends TSubject
      ? TProperty
      : never
    : never;
}[keyof TClass];

export class EventListenerBuilder<T extends ClassLike<T>> {
  constructor(public key: T) {}

  do(target: (subject: InstanceType<T>) => void): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T>>(target: C, method: M): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T>>(
    target: C | ((subject: InstanceType<T>) => void),
    method?: M,
  ): Listener<T> {
    return method
      ? new ClassEventListener(this.key, target as C, method)
      : new FunctionEventListener(this.key, target as (subject: InstanceType<T>) => void);
  }
}

export class ClassEventListener<
  T extends ClassLike<T>,
  V extends Constructor,
  M extends MethodOf<V, T>
> extends Listener<T> {
  constructor(public key: T, private listenerClass: V, private listenerMethod: M) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: ServiceLocator): void {
    const handler = container.get(this.listenerClass);
    handler[this.listenerMethod](subject);
  }
}

export class FunctionEventListener<T extends ClassLike<T>> extends Listener<T> {
  constructor(public key: T, private handler: (subject: InstanceType<T>) => any) {
    super(key);
  }

  handle(subject: InstanceType<T>): void {
    this.handler(subject);
  }
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}
