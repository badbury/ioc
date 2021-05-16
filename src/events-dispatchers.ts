import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import { EventSink } from './events';
import { Listener } from './events-listeners';
import { AbstractClass, AllInstanceType, ClassLike, Method, Newable } from './type-utils';

export abstract class Dispatcher<T> implements Definition<Dispatcher<T>> {
  definition = Dispatcher;
  constructor(public key: T) {}
  abstract handle(
    subject: T,
    container: ServiceLocator,
    sink: EventSink,
    listeners: Listener<T>[],
  ): unknown;
}

export type ListnerFunctions<T extends ClassLike<T>> = ((subject: InstanceType<T>) => unknown)[];

export type DispatchMethod<
  TClassType extends Newable,
  TSubjectType extends Newable,
  TExtrasType extends AbstractClass[]
> = Method<
  InstanceType<TClassType>,
  [InstanceType<TSubjectType>, ListnerFunctions<TSubjectType>, ...AllInstanceType<TExtrasType>]
>;

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

  handle(
    subject: InstanceType<T>,
    container: ServiceLocator,
    sink: EventSink,
    listeners: Listener<T>[],
  ): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const listenerFunctions: ListnerFunctions<T> = listeners.map((listener) => {
      return (subject: InstanceType<T>): unknown => listener.handle(subject, container, sink);
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

  handle(
    subject: InstanceType<T>,
    container: ServiceLocator,
    sink: EventSink,
    listeners: Listener<T>[],
  ): unknown {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<A>;
    const listenerFunctions: ListnerFunctions<T> = listeners.map((listener) => {
      return (subject: InstanceType<T>): unknown => listener.handle(subject, container, sink);
    });
    return this.handler(subject, listenerFunctions, ...args);
  }
}
