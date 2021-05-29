import { Definition } from './container';
import { ServiceLocator } from './dependency-injection';
import { emitUnknownValue, EventSink } from './events';
import {
  ClassEventDispatcher,
  Dispatcher,
  FunctionEventDispatcher,
  DispatchFunction,
  DispatchMethod,
} from './events-dispatchers';
import { AbstractClass, AllInstanceType, ClassLike, Method, Newable } from './type-utils';

export class Listener<T, C extends Callable<[T]> = Callable<[T]>>
  implements Definition<Listener<T, C>> {
  definition = Listener;
  constructor(public key: T, private callable: C) {}

  handle(subject: T, container: ServiceLocator, events: EventSink): unknown {
    return this.callable.handle([subject], container, events);
  }

  emit(): Listener<T, C> {
    return new Listener(this.key, this.callable.emit() as C);
  }
}

type ListenerMethod<
  TClassType extends Newable,
  TSubjectType extends Newable,
  TExtrasType extends AbstractClass[]
> = Method<InstanceType<TClassType>, [InstanceType<TSubjectType>, ...AllInstanceType<TExtrasType>]>;

type ListenerFunction<TSubjectType extends Newable, TExtrasType extends AbstractClass[]> = (
  subject: InstanceType<TSubjectType>,
  ...args: AllInstanceType<TExtrasType>
) => unknown;

interface CallableSetter<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn
> {
  (target: CallableFunction<TPassedArgs, TContainerArgs, TReturn>): Callable<
    TPassedArgs,
    TContainerArgs,
    TReturn
  >;
  <T extends AbstractClass<CallableFunction<TPassedArgs, TContainerArgs, TReturn>>>(
    target: T,
  ): Callable<TPassedArgs, TContainerArgs, TReturn>;
  <T extends Newable, M extends CallableMethod<T, TPassedArgs, TContainerArgs, TReturn>>(
    target: T,
    method: M,
  ): Callable<TPassedArgs, TContainerArgs, TReturn>;
}
export class EventListenerBuilder<T extends ClassLike<T>, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = ([] as unknown) as A) {}

  use<P extends AbstractClass[]>(...args: P): EventListenerBuilder<T, P> {
    return new EventListenerBuilder(this.key, args);
  }

  do(target: CallableFunction<[T], A>): Listener<T, Callable<[T], A>>;
  do<F extends AbstractClass<CallableFunction<[T], A>>>(target: F): Listener<T, Callable<[T], A>>;
  do<C extends Newable, M extends ListenerMethod<C, T, A>>(
    target: C,
    method: M,
  ): Listener<T, Callable<[T], A>>;
  do<C extends Newable, M extends CallableMethod<C, [T], A>>(
    target: C | CallableFunction<[T], A>,
    method?: M,
  ): Listener<T, Callable<[T], A>> {
    const callable: Callable<[T], A> = method
      ? new ClassCallable(this.args, target as C, method as M)
      : new FunctionCallable(this.args, target as CallableFunction<[T], A>);
    return new Listener(this.key, callable);
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

type CallableFunction<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown
> = (...args: [...TPassedArgs, ...AllInstanceType<TContainerArgs>]) => TReturn;

type CallableMethod<
  TClassType extends Newable,
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown
> = Method<InstanceType<TClassType>, [...TPassedArgs, ...AllInstanceType<TContainerArgs>], TReturn>;

export class CallableBuilder<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown
> {
  constructor(public args: TContainerArgs = ([] as unknown) as TContainerArgs) {}

  use<T extends AbstractClass[]>(...args: T): CallableBuilder<TPassedArgs, T, TReturn> {
    return new CallableBuilder(args);
  }

  do(
    target: CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
  ): Callable<TPassedArgs, TContainerArgs, TReturn>;
  do<T extends AbstractClass<CallableFunction<TPassedArgs, TContainerArgs, TReturn>>>(
    target: T,
  ): Callable<TPassedArgs, TContainerArgs, TReturn>;
  do<T extends Newable, M extends CallableMethod<T, TPassedArgs, TContainerArgs, TReturn>>(
    target: T,
    method: M,
  ): Callable<TPassedArgs, TContainerArgs, TReturn>;
  do<T extends Newable, M extends CallableMethod<T, TPassedArgs, TContainerArgs, TReturn>>(
    target: T | CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
    method?: M,
  ): Callable<TPassedArgs, TContainerArgs, TReturn> {
    return method
      ? new ClassCallable(this.args, target as T, method)
      : new FunctionCallable(
          this.args,
          target as CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
        );
  }
}

abstract class Callable<P extends unknown[], C extends AbstractClass[] = [], R = unknown> {
  abstract handle(passed: P, container: ServiceLocator, sink: EventSink): R;
  abstract emit(): Callable<P, C, R>;
}

export class ClassCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
  TClass extends Newable,
  TMethod extends CallableMethod<TClass, TPassedArgs, TContainerArgs, TReturn>
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    public args: TContainerArgs,
    private listenerClass: TClass,
    private listenerMethod: TMethod,
    private shouldEmitResponse: boolean = false,
  ) {
    super();
  }

  handle(passedArgs: TPassedArgs, container: ServiceLocator, sink: EventSink): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<TContainerArgs>;
    const handler = container.get(this.listenerClass);
    const result: TReturn = handler[this.listenerMethod](...passedArgs, ...args);
    if (this.shouldEmitResponse) {
      emitUnknownValue(result, sink);
    }
    return result;
  }

  emit(): ClassCallable<TPassedArgs, TContainerArgs, TReturn, TClass, TMethod> {
    return new ClassCallable(this.args, this.listenerClass, this.listenerMethod, true);
  }
}

export class FunctionCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    public args: TContainerArgs,
    private handler: CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
    private shouldEmitResponse: boolean = false,
  ) {
    super();
  }

  handle(passedArgs: TPassedArgs, container: ServiceLocator, sink: EventSink): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<TContainerArgs>;
    const handler = container.get(this.handler) || this.handler;
    const result: TReturn = handler(...passedArgs, ...args);
    if (this.shouldEmitResponse) {
      emitUnknownValue(result, sink);
    }
    return result;
  }

  emit(): FunctionCallable<TPassedArgs, TContainerArgs, TReturn> {
    return new FunctionCallable(this.args, this.handler, true);
  }
}
