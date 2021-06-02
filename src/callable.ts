import { ServiceLocator } from './dependency-injection';
import { emitUnknownValue, EventSink } from './events';
import { AbstractClass, AllInstanceType, Method, Newable } from './type-utils';

export interface CallableSetter<
  TPassedArgs extends unknown[] = [],
  TContainerArgs extends AbstractClass[] = [],
  TReturn = unknown,
  TResponse = Callable<TPassedArgs, TContainerArgs, TReturn>
> {
  (target: CallableFunction<TPassedArgs, TContainerArgs, TReturn>): TResponse;
  <T extends AbstractClass<CallableFunction<TPassedArgs, TContainerArgs, TReturn>>>(
    target: T,
  ): TResponse;
  <T extends Newable, M extends CallableMethod<T, TPassedArgs, TContainerArgs, TReturn>>(
    target: T,
    method: M,
  ): TResponse;
}

class CallableSetterBuilder<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown
> {
  constructor(private args: TContainerArgs = ([] as unknown) as TContainerArgs) {}

  withPassedArgs<T extends unknown[]>(): CallableSetterBuilder<T, TContainerArgs, TReturn> {
    return new CallableSetterBuilder(this.args);
  }

  withContainerArgs<T extends AbstractClass[]>(
    args: T,
  ): CallableSetterBuilder<TPassedArgs, T, TReturn> {
    return new CallableSetterBuilder(args);
  }

  withReturn<T>(): CallableSetterBuilder<TPassedArgs, TContainerArgs, T> {
    return new CallableSetterBuilder(this.args);
  }

  get = (): CallableSetter<TPassedArgs, TContainerArgs, TReturn> => {
    return (target: unknown, method?: unknown): Callable<TPassedArgs, TContainerArgs, TReturn> => {
      return method
        ? new ClassCallable(this.args, target as never, method as never)
        : new FunctionCallable(
            this.args,
            target as CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
          );
    };
  };

  map = <TMapReturn>(
    transformer: (c: Callable<TPassedArgs, TContainerArgs, TReturn>) => TMapReturn,
  ): CallableSetter<TPassedArgs, TContainerArgs, TReturn, TMapReturn> => {
    return (target: unknown, method?: unknown): TMapReturn => {
      return transformer(this.get()(target as never, method as never));
    };
  };
}

export const callableSetter = (): CallableSetterBuilder<[], []> => new CallableSetterBuilder();
export const callable = callableSetter().get();

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

  do = callableSetter()
    .withPassedArgs<TPassedArgs>()
    .withContainerArgs(this.args)
    .withReturn<TReturn>()
    .get();
}

export abstract class Callable<
  P extends unknown[] = [],
  C extends AbstractClass[] = [],
  R = unknown
> {
  abstract call(passed: P, container: ServiceLocator, sink?: EventSink): R;
  abstract emit(): Callable<P, C, R>;

  compile(container: ServiceLocator, sink?: EventSink): (...args: P) => R {
    return (...passed: P): R => {
      return this.call(passed, container, sink);
    };
  }

  before: CallableSetter<P, [], P[0], CallablePrepend<P, C, R>> = callableSetter()
    .withPassedArgs<P>()
    .withReturn<P[0]>()
    .map((callable) => new CallablePrepend<P, C, R>(callable, this));

  // tapBefore: CallableSetter<P, [], P[0], CallablePrepend<P, C, R>> = callableSetter()
  //   .withPassedArgs<P>()
  //   .map((callable) => new CallablePrepend<P, C, R>(callable, this));

  intercept: CallableSetter<
    [...P, (...args: P) => R],
    [],
    R,
    InterceptedCallable<P, C, R>
  > = callableSetter()
    .withPassedArgs<[...P, (...args: P) => R]>()
    .withReturn<R>()
    .map((callable) => new InterceptedCallable<P, C, R>(this, callable));

  // tapIntercept: CallableSetter<
  //   [...P, (...args: P) => R],
  //   [],
  //   R,
  //   InterceptedCallable<P, C, R>
  // > = callableSetter()
  //   .withPassedArgs<[...P, (...args: P) => R]>()
  //   .withReturn<R>()
  //   .map((callable) => new InterceptedCallable<P, C, R>(this, callable));

  after: CallableSetter<[R], [], R, CallableAppend<P, C, R, R>> = callableSetter()
    .withPassedArgs<[R]>()
    .withReturn<R>()
    .map((callable) => new CallableAppend<P, C, R, R>(this, callable));

  // tapAfter: CallableSetter<P, [], P[0], CallablePrepend<P, C, R>> = callableSetter()
  //   .withPassedArgs<P>()
  //   .map((callable) => new CallablePrepend<P, C, R>(callable, this));

  // pipe: CallableSetter<[R], [], any, CallableAppend<P, C, R, any>> = callableSetter()
  //   .withPassedArgs<[R]>()
  //   .map((callable) => new CallableAppend<P, C, R, any>(this, callable));
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

  call(passedArgs: TPassedArgs, container: ServiceLocator, sink?: EventSink): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<TContainerArgs>;
    const handler = container.get(this.listenerClass);
    const result: TReturn = handler[this.listenerMethod](...passedArgs, ...args);
    if (this.shouldEmitResponse && sink) {
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

  call(passedArgs: TPassedArgs, container: ServiceLocator, sink?: EventSink): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<TContainerArgs>;
    const handler = container.get(this.handler) || this.handler;
    const result: TReturn = handler(...passedArgs, ...args);
    if (this.shouldEmitResponse && sink) {
      emitUnknownValue(result, sink);
    }
    return result;
  }

  emit(): FunctionCallable<TPassedArgs, TContainerArgs, TReturn> {
    return new FunctionCallable(this.args, this.handler, true);
  }
}

export class CallablePrepend<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    private callableOne: Callable<TPassedArgs, [], TPassedArgs[0]>,
    private callableTwo: Callable<TPassedArgs, TContainerArgs, TReturn>,
  ) {
    super();
  }

  call(passedArgs: TPassedArgs, container: ServiceLocator, sink?: EventSink): TReturn {
    passedArgs[0] = this.callableOne.call(passedArgs, container, sink);
    return this.callableTwo.call(passedArgs, container, sink);
  }

  emit(): CallablePrepend<TPassedArgs, TContainerArgs, TReturn> {
    return new CallablePrepend(this.callableOne, this.callableTwo.emit());
  }
}

export class CallableAppend<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturnOne,
  TReturnTwo
> extends Callable<TPassedArgs, TContainerArgs, TReturnTwo> {
  constructor(
    private callableOne: Callable<TPassedArgs, TContainerArgs, TReturnOne>,
    private callableTwo: Callable<[TReturnOne], [], TReturnTwo>,
  ) {
    super();
  }

  call(passedArgs: TPassedArgs, container: ServiceLocator, sink?: EventSink): TReturnTwo {
    const resultOne = this.callableOne.call(passedArgs, container, sink);
    const resultTwo = this.callableTwo.call([resultOne], container, sink);
    return resultTwo;
  }

  emit(): CallableAppend<TPassedArgs, TContainerArgs, TReturnOne, TReturnTwo> {
    return new CallableAppend(this.callableOne, this.callableTwo.emit());
  }
}

type InterceptorCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn
> = Callable<[...TPassedArgs, (...args: TPassedArgs) => TReturn], TContainerArgs, TReturn>;

export class InterceptedCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    private subject: Callable<TPassedArgs, TContainerArgs, TReturn>,
    private interceptor: InterceptorCallable<TPassedArgs, TContainerArgs, TReturn>,
  ) {
    super();
  }

  call(passedArgs: TPassedArgs, container: ServiceLocator, sink?: EventSink): TReturn {
    const interceptorCallback = (...args: TPassedArgs) => this.subject.call(args, container, sink);
    return this.interceptor.call([...passedArgs, interceptorCallback], container, sink);
  }

  emit(): InterceptedCallable<TPassedArgs, TContainerArgs, TReturn> {
    return new InterceptedCallable(this.subject.emit(), this.interceptor);
  }
}
