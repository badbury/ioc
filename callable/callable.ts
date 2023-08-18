import { EventSink, ServiceLocator } from "../contracts.ts";
import { emitUnknownValue } from "../events.ts";
import {
  AbstractClass,
  AllInstanceType,
  AnyFunction,
  Method,
  Newable,
} from "../type_utils.ts";

// If we don't use any then literal functions become too permissive
type NotActualFunction<T> = T extends AnyFunction ? never : T;

export type CallableInputFunction<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
> = [fn: CallableFunction<TPassedArgs, TContainerArgs, TReturn>];

export type CallableInputAbstract<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
  T,
> = [
  abstract: T extends {
    prototype: CallableFunction<TPassedArgs, TContainerArgs, TReturn>;
  } & NotActualFunction<T> ? T
    : never,
];

export type CallableInputMethod<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
  T,
  M,
> = [
  target: T extends { prototype: unknown } ? T : never,
  method: T extends { prototype: unknown }
    ? M extends keyof T["prototype"]
      ? T["prototype"][M] extends
        CallableFunction<TPassedArgs, TContainerArgs, TReturn> ? M
      : never
    : never
    : never,
];

export type CallableInput<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
  TInput extends unknown[],
> =
  | CallableInputFunction<TPassedArgs, TContainerArgs, TReturn>
  | CallableInputAbstract<TPassedArgs, TContainerArgs, TReturn, TInput[0]>
  | CallableInputMethod<
    TPassedArgs,
    TContainerArgs,
    TReturn,
    TInput[0],
    TInput[1]
  >;

export interface CallableSetter<
  TPassedArgs extends unknown[] = [],
  TContainerArgs extends AbstractClass[] = [],
  TReturn = unknown,
  TResponse = Callable<TPassedArgs, TContainerArgs, TReturn>,
> {
  (
    fn: CallableInputFunction<TPassedArgs, TContainerArgs, TReturn>[0],
  ): TResponse;
  <T>(
    abstract:
      & T
      & CallableInputAbstract<TPassedArgs, TContainerArgs, TReturn, T>[0],
  ): TResponse;
  <C, M>(
    subject:
      & C
      & CallableInputMethod<TPassedArgs, TContainerArgs, TReturn, C, M>[0],
    method:
      & M
      & CallableInputMethod<TPassedArgs, TContainerArgs, TReturn, C, M>[1],
  ): TResponse;
}

class CallableSetterBuilder<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown,
> {
  constructor(
    private args: TContainerArgs = ([] as unknown) as TContainerArgs,
  ) {}

  withPassedArgs<T extends unknown[]>(): CallableSetterBuilder<
    T,
    TContainerArgs,
    TReturn
  > {
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
    return <A extends unknown[]>(
      ...input: A & CallableInput<TPassedArgs, TContainerArgs, TReturn, A>
    ): Callable<TPassedArgs, TContainerArgs, TReturn> => {
      if (input[1]) {
        const subject = input[0] as Newable;
        const method = input[1] as CallableMethod<
          Newable,
          TPassedArgs,
          TContainerArgs,
          TReturn
        >;
        return new ClassCallable(this.args, subject, method);
      }
      return new FunctionCallable(
        this.args,
        input[0] as CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
      );
    };
  };

  map = <TMapReturn>(
    transformer: (
      c: Callable<TPassedArgs, TContainerArgs, TReturn>,
    ) => TMapReturn,
  ): CallableSetter<TPassedArgs, TContainerArgs, TReturn, TMapReturn> => {
    return (
      ...input: CallableInputFunction<TPassedArgs, TContainerArgs, TReturn>
    ): TMapReturn => {
      return transformer(this.get()(...input));
    };
  };
}

export const callableSetter = (): CallableSetterBuilder<[], []> =>
  new CallableSetterBuilder();
export const callable = callableSetter().get();

type CallableFunction<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown,
> = (...args: [...TPassedArgs, ...AllInstanceType<TContainerArgs>]) => TReturn;

type CallableMethod<
  TClassType extends Newable,
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown,
> = Method<
  InstanceType<TClassType>,
  [...TPassedArgs, ...AllInstanceType<TContainerArgs>],
  TReturn
>;

export class CallableBuilder<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn = unknown,
> {
  public do: CallableSetter<
    TPassedArgs,
    TContainerArgs,
    TReturn,
    Callable<TPassedArgs, TContainerArgs, TReturn>
  >;

  constructor(
    public args: TContainerArgs = ([] as unknown) as TContainerArgs,
  ) {
    this.do = callableSetter()
      .withPassedArgs<TPassedArgs>()
      .withContainerArgs(this.args)
      .withReturn<TReturn>()
      .get();
  }

  use<T extends AbstractClass[]>(
    ...args: T
  ): CallableBuilder<TPassedArgs, T, TReturn> {
    return new CallableBuilder(args);
  }
}

export abstract class Callable<
  P extends unknown[] = [],
  C extends AbstractClass[] = [],
  R = unknown,
> {
  abstract call(passed: P, container: ServiceLocator, sink?: EventSink): R;
  abstract emit(): Callable<P, C, R>;

  compile(container: ServiceLocator, sink?: EventSink): (...args: P) => R {
    return (...passed: P): R => {
      return this.call(passed, container, sink);
    };
  }

  before: CallableSetter<P, [], P[0], Callable<P, C, R>> = callableSetter()
    .withPassedArgs<P>()
    .withReturn<P[0]>()
    .map(
      (callable) =>
        new DynamicCallable(
          (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
            passedArgs[0] = callable.call(passedArgs, container, sink);
            return this.call(passedArgs, container, sink);
          },
        ),
    );

  teeBefore: CallableSetter<P, [], unknown, Callable<P, C, R>> =
    callableSetter()
      .withPassedArgs<P>()
      .map(
        (callable) =>
          new DynamicCallable(
            (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
              callable.call(passedArgs, container, sink);
              return this.call(passedArgs, container, sink);
            },
          ),
      );

  intercept: CallableSetter<
    [...P, (...args: P) => R],
    [],
    R,
    Callable<P, C, R>
  > = callableSetter()
    .withPassedArgs<[...P, (...args: P) => R]>()
    .withReturn<R>()
    .map(
      (callable) =>
        new DynamicCallable(
          (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
            const interceptorCallback = (...args: P) =>
              this.call(args, container, sink);
            return callable.call(
              [...passedArgs, interceptorCallback],
              container,
              sink,
            );
          },
        ),
    );

  teeIntercept: CallableSetter<
    [...P, () => R],
    [],
    unknown,
    Callable<P, C, R>
  > = callableSetter()
    .withPassedArgs<[...P, () => R]>()
    .map(
      (callable) =>
        new DynamicCallable(
          (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
            let result: R = (undefined as unknown) as R;
            const interceptorCallback = () => {
              result = this.call(passedArgs, container, sink);
              return result;
            };
            const intResult = callable.call(
              [...passedArgs, interceptorCallback],
              container,
              sink,
            );
            if (intResult instanceof Promise) {
              return (intResult.then(() => result) as unknown) as R;
            }
            return result;
          },
        ),
    );

  after: CallableSetter<[R], [], R, Callable<P, C, R>> = callableSetter()
    .withPassedArgs<[R]>()
    .withReturn<R>()
    .map(
      (callable) =>
        new DynamicCallable(
          (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
            const resultOne = this.call(passedArgs, container, sink);
            const resultTwo = callable.call([resultOne], container, sink);
            return resultTwo;
          },
        ),
    );

  teeAfter: CallableSetter<[R], [], unknown, Callable<P, C, R>> =
    callableSetter()
      .withPassedArgs<[R]>()
      .map(
        (callable) =>
          new DynamicCallable(
            (passedArgs: P, container: ServiceLocator, sink?: EventSink) => {
              const result = this.call(passedArgs, container, sink);
              callable.call([result], container, sink);
              return result;
            },
          ),
      );

  // pipe: CallableSetter<[R], [], any, CallableAppend<P, C, R, any>> = callableSetter()
  //   .withPassedArgs<[R]>()
  //   .map((callable) => new CallableAppend<P, C, R, any>(this, callable));
}

export class ClassCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
  TClass extends Newable,
  TMethod extends CallableMethod<TClass, TPassedArgs, TContainerArgs, TReturn>,
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    public args: TContainerArgs,
    private listenerClass: TClass,
    private listenerMethod: TMethod,
    private shouldEmitResponse: boolean = false,
  ) {
    super();
  }

  call(
    passedArgs: TPassedArgs,
    container: ServiceLocator,
    sink?: EventSink,
  ): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<
      TContainerArgs
    >;
    const handler = container.get(this.listenerClass);
    const result: TReturn = handler[this.listenerMethod](
      ...passedArgs,
      ...args,
    );
    if (this.shouldEmitResponse && sink) {
      emitUnknownValue(result, sink);
    }
    return result;
  }

  emit(): ClassCallable<TPassedArgs, TContainerArgs, TReturn, TClass, TMethod> {
    return new ClassCallable(
      this.args,
      this.listenerClass,
      this.listenerMethod,
      true,
    );
  }
}

export class FunctionCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    public args: TContainerArgs,
    private handler: CallableFunction<TPassedArgs, TContainerArgs, TReturn>,
    private shouldEmitResponse: boolean = false,
  ) {
    super();
  }

  call(
    passedArgs: TPassedArgs,
    container: ServiceLocator,
    sink?: EventSink,
  ): TReturn {
    const args = this.args.map((key) => container.get(key)) as AllInstanceType<
      TContainerArgs
    >;
    const isClass = this.handler.toString().substring(0, 5) === "class";
    const handler = isClass ? container.get(this.handler) : this.handler;
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

export class DynamicCallable<
  TPassedArgs extends unknown[],
  TContainerArgs extends AbstractClass[],
  TReturn,
> extends Callable<TPassedArgs, TContainerArgs, TReturn> {
  constructor(
    private handler: (
      passedArgs: TPassedArgs,
      container: ServiceLocator,
      sink?: EventSink,
    ) => TReturn,
  ) {
    super();
  }

  call(
    passedArgs: TPassedArgs,
    container: ServiceLocator,
    sink?: EventSink,
  ): TReturn {
    return this.handler(passedArgs, container, sink);
  }

  emit(): DynamicCallable<TPassedArgs, TContainerArgs, TReturn> {
    return new DynamicCallable(this.handler);
  }
}
