import { Callable, callableSetter } from './callable';
import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import { EventSink } from './events';
import { Dispatcher, ListnerFunctions } from './events-dispatchers';
import { AbstractClass, ClassLike, Newable } from './type-utils';

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

export class EventListenerBuilder<T extends ClassLike<T>, A extends AbstractClass[] = []> {
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
