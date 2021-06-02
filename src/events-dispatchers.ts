import { Callable } from './callable';
import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import { EventSink } from './events';
import { Listener } from './events-listeners';
import { ClassLike, Newable } from './type-utils';

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

export type ListnerFunctions<T extends ClassLike<T>> = ((subject: InstanceType<T>) => unknown)[];
