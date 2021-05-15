import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import { Listener } from './events-listeners';
import { AbstractClass, AllInstanceType, ClassLike, Newable } from './type-utils';

export abstract class Dispatcher<T> implements Definition<Dispatcher<T>> {
  definition = Dispatcher;
  constructor(public key: T) {}
  abstract handle(subject: T, container: ServiceLocator, listeners: Listener<T>[]): unknown;
}

export type ListnerFunctions<T extends ClassLike<T>> = ((subject: InstanceType<T>) => unknown)[];

export type DispatchMethod<
  TClassType extends Newable,
  TSubjectType extends Newable,
  TExtrasType extends AbstractClass[],
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>,
  TExtras = AllInstanceType<TExtrasType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (
    arg: infer U,
    listeners: infer X,
    ...extras: infer E
  ) => unknown
    ? U extends TSubject
      ? X extends ListnerFunctions<TSubjectType>
        ? E extends TExtras
          ? TProperty
          : never
        : never
      : never
    : never;
}[keyof TClass];

export type DispatchFunction<T extends ClassLike<T>, A extends AbstractClass[]> = (
  subject: InstanceType<T>,
  listeners: ListnerFunctions<T>,
  ...extras: AllInstanceType<A>
) => unknown;

export class ClassEventDispatcher<
  T extends ClassLike<T>,
  A extends AbstractClass[],
  V extends Newable,
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
