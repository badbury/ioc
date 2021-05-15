import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import {
  ClassEventDispatcher,
  Dispatcher,
  FunctionEventDispatcher,
  DispatchFunction,
  DispatchMethod,
} from './events-dispatchers';
import { AbstractClass, AllInstanceType, ClassLike, Newable } from './type-utils';

export abstract class Listener<T> implements Definition<Listener<T>> {
  definition = Listener;
  constructor(public key: T) {}
  abstract handle(subject: T, container: ServiceLocator): unknown;
}

type ListenerMethod<
  TClassType extends Newable,
  TSubjectType extends Newable,
  TExtrasType extends AbstractClass[],
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>,
  TExtras = AllInstanceType<TExtrasType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (
    arg: infer U,
    ...extras: infer E
  ) => unknown
    ? U extends TSubject
      ? E extends TExtras
        ? TProperty
        : never
      : never
    : never;
}[keyof TClass];

type ListenerFunction<TSubjectType extends Newable, TExtrasType extends AbstractClass[]> = (
  subject: InstanceType<TSubjectType>,
  ...args: AllInstanceType<TExtrasType>
) => unknown;

export class EventListenerBuilder<T extends ClassLike<T>, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = [] as any) {}

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }

  do(target: ListenerFunction<T, A>): Listener<T>;
  do<C extends Newable, M extends ListenerMethod<C, T, A>>(target: C, method: M): Listener<T>;
  do<C extends Newable, M extends ListenerMethod<C, T, A>>(
    target: C | ListenerFunction<T, A>,
    method?: M,
  ): Listener<T> {
    return method
      ? new ClassEventListener(this.key, this.args, target as C, method)
      : new FunctionEventListener(this.key, this.args, target as ListenerFunction<T, A>);
  }

  dispatchWith(target: DispatchFunction<T, A>): Dispatcher<T>;
  dispatchWith<C extends Newable, M extends DispatchMethod<C, T, A>>(
    target: C,
    method: M,
  ): Dispatcher<T>;
  dispatchWith<C extends Newable, M extends DispatchMethod<C, T, A>>(
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
  V extends Newable,
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
