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

export function callable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown
>(args: TContainerArgs) {
  type TCallable = Callable<TPassedArgs, TContainerArgs, TReturn>;
  type TCallableFunction = CallableFunction<TPassedArgs, TContainerArgs, TReturn>;
  return {
    map: <TMapReturn>(
      transformer: (c: TCallable) => TMapReturn,
    ): CallableSetter<TPassedArgs, TContainerArgs, TReturn, TMapReturn> => (
      target: unknown,
      method?: unknown,
    ): TMapReturn => {
      const callable: TCallable = method
        ? new ClassCallable(args, target as any, method as any)
        : new FunctionCallable(args, target as TCallableFunction);
      return transformer(callable);
    },
  };
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

export abstract class Callable<
  P extends unknown[] = [],
  C extends AbstractClass[] = [],
  R = unknown
> {
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
