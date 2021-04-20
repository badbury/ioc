import { Container, Listener } from './Container';

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

  handle(subject: InstanceType<T>, container: Container): void {
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
