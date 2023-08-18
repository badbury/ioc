import {
  Callable,
  callable,
  CallableInput,
  CallableInputAbstract,
  CallableInputFunction,
  CallableInputMethod,
} from "./callable.ts";
import { ResolverMiddleware, ServiceLocator } from "../contracts.ts";
import { AbstractClass, AnyFunction, HasMethod } from "../type_utils.ts";

type ModifyCallable<T extends (...args: unknown[]) => unknown> = (
  method: CallableFromFn<T>,
) => CallableFromFn<T>;

export class MethodModifierMiddleware<
  T extends Record<string, unknown> & Record<M, () => unknown>,
  N extends keyof T,
  M extends HasMethod<T, N>,
> implements ResolverMiddleware<T> {
  private modifiers: ModifyCallable<T[M]>[] = [];

  constructor(public key: M) {}

  resolve(
    container: ServiceLocator,
    next: (container: ServiceLocator) => T,
  ): T {
    const instance = next(container);

    // deno-lint-ignore ban-types
    const method = instance[this.key] as T[M] & Function;
    let callableMethod =
      (callable(method.bind(instance)) as unknown) as CallableFromFn<T[M]>;
    for (const modifier of this.modifiers) {
      callableMethod = modifier(callableMethod);
    }
    instance[this.key] = callableMethod.compile(container) as T[M];

    return instance;
  }

  withModifier(modifyCallable: ModifyCallable<T[M]>): this {
    this.modifiers.push(modifyCallable);
    return this;
  }
}

export interface MethodModifier<
  TClass extends AbstractClass,
  TResponse,
  TProperty extends keyof TClass["prototype"] = keyof TClass["prototype"],
  TMethodName extends TClass["prototype"][TProperty] extends AnyFunction
    ? TProperty
    : never = keyof TClass["prototype"][TProperty] extends AnyFunction
      ? TProperty
      : never,
  TMethod extends TClass["prototype"][TMethodName] =
    TClass["prototype"][TMethodName],
  TPassedArgs extends unknown[] = Parameters<TMethod>,
  TReturn = ReturnType<TMethod>,
> {
  (
    method: TMethodName,
    fn: CallableInputFunction<TPassedArgs, [], TReturn>[0],
  ): TResponse;
  <T>(
    method: TMethodName,
    abstract: T & CallableInputAbstract<TPassedArgs, [], TReturn, T>[0],
  ): TResponse;
  <C, M>(
    method: TMethodName,
    subject: C & CallableInputMethod<TPassedArgs, [], TReturn, C, M>[0],
    callableMethod: M & CallableInputMethod<TPassedArgs, [], TReturn, C, M>[1],
  ): TResponse;
}

type CallableFromFn<T extends (...args: unknown[]) => unknown> = Callable<
  Parameters<T>,
  [],
  ReturnType<T>
>;

// Before

export type BeforeCallableInput<
  TMethod extends AnyFunction,
  TInput extends unknown[],
> = CallableInput<Parameters<TMethod>, [], Parameters<TMethod>[0], TInput>;

export type MethodBefore<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs:
    & TInput
    & BeforeCallableInput<K["prototype"][TMethodName], TInput>
) => TReturn;

// TeeBefore

export type TeeBeforeCallableInput<
  TMethod extends (...args: unknown[]) => unknown,
  TInput extends unknown[],
> = CallableInput<Parameters<TMethod>, [], unknown, TInput>;

export type MethodTeeBefore<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs: TInput & [
    ...TeeBeforeCallableInput<K["prototype"][TMethodName], TInput>,
  ]
) => TReturn;

// Intercept

export type InterceptCallableInput<
  TMethod extends AnyFunction,
  TInput extends unknown[],
> = CallableInput<
  [
    ...Parameters<TMethod>,
    (...args: Parameters<TMethod>) => ReturnType<TMethod>,
  ],
  [],
  ReturnType<TMethod>,
  TInput
>;

export type MethodIntercept<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs:
    & TInput
    & InterceptCallableInput<K["prototype"][TMethodName], TInput>
) => TReturn;

// TeeIntercept

export type TeeInterceptCallableInput<
  TMethod extends (...args: unknown[]) => unknown,
  TInput extends unknown[],
> = CallableInput<[...Parameters<TMethod>, () => unknown], [], unknown, TInput>;

export type MethodTeeIntercept<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs: TInput & [
    ...TeeInterceptCallableInput<K["prototype"][TMethodName], TInput>,
  ]
) => TReturn;

// After

export type AfterCallableInput<
  TMethod extends AnyFunction,
  TInput extends unknown[],
> = CallableInput<[ReturnType<TMethod>], [], ReturnType<TMethod>, TInput>;

export type MethodAfter<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs:
    & TInput
    & AfterCallableInput<K["prototype"][TMethodName], TInput>
) => TReturn;

// TeeAfter

export type TeeAfterCallableInput<
  TMethod extends (...args: unknown[]) => unknown,
  TInput extends unknown[],
> = CallableInput<[ReturnType<TMethod>], [], unknown, TInput>;

export type MethodTeeAfter<K extends AbstractClass, TReturn> = <
  TProp extends keyof K["prototype"],
  TMethodName extends HasMethod<K["prototype"], TProp>,
  TInput extends unknown[],
>(
  method: TMethodName,
  ...callableArgs: TInput & [
    ...TeeAfterCallableInput<K["prototype"][TMethodName], TInput>,
  ]
) => TReturn;
