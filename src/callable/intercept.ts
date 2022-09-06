import {
  callable,
  Callable,
  CallableInputFunction,
  CallableInput,
  CallableInputAbstract,
  CallableInputMethod,
  CallableFunction,
  callableSetter,
  DynamicCallable,
  CallableSetter,
} from './callable';
import { EventSink, ResolverMiddleware, ServiceLocator } from '../contracts';
import { AbstractClass, AnyFunction, HasMethod } from '../type-utils';

type ModifyCallable<T extends (...args: unknown[]) => unknown> = (
  method: CallableFromFn<T>,
) => CallableFromFn<T>;

export class FunctionModifierMiddleware<T extends AbstractFunction>
  implements ResolverMiddleware<T> {
  private modifiers: ModifyCallable<T>[] = [];

  resolve(container: ServiceLocator, next: (container: ServiceLocator) => T): T {
    const instance = next(container);

    let callableMethod = (callable(instance) as unknown) as CallableFromFn<T>;
    for (const modifier of this.modifiers) {
      callableMethod = modifier(callableMethod);
    }
    return callableMethod.compile(container) as T;
  }

  withModifier(modifyCallable: ModifyCallable<T>): this {
    this.modifiers.push(modifyCallable);
    return this;
  }
}

export class MethodModifierMiddleware<
  T extends Record<string, any>,
  N extends keyof T,
  M extends HasMethod<T, N>
> implements ResolverMiddleware<T> {
  private modifiers: ModifyCallable<T[M]>[] = [];

  constructor(public key: M) {}

  resolve(container: ServiceLocator, next: (container: ServiceLocator) => T): T {
    const instance = next(container);

    // eslint-disable-next-line @typescript-eslint/ban-types
    const method = instance[this.key] as T[M] & Function;
    let callableMethod = (callable(method.bind(instance)) as unknown) as CallableFromFn<T[M]>;
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
  TProperty extends keyof TClass['prototype'] = keyof TClass['prototype'],
  TMethodName extends TClass['prototype'][TProperty] extends AnyFunction
    ? TProperty
    : never = keyof TClass['prototype'][TProperty] extends AnyFunction ? TProperty : never,
  TMethod extends TClass['prototype'][TMethodName] = TClass['prototype'][TMethodName],
  TPassedArgs extends unknown[] = Parameters<TMethod>,
  TReturn = ReturnType<TMethod>
> {
  (method: TMethodName, fn: CallableInputFunction<TPassedArgs, [], TReturn>[0]): TResponse;
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

// Inter

export type InterceptContext<TMethod extends AnyFunction> = {
  args: Parameters<TMethod>;
  next: (...args: Parameters<TMethod>) => ReturnType<TMethod>;
};

export type InterceptCallableInput<
  TMethod extends AnyFunction,
  TInput extends unknown[]
> = CallableInput<[InterceptContext<TMethod>], [], ReturnType<TMethod>, TInput>;

export interface AbstractFunction {
  (...arg: any[]): any;
}
export abstract class AbstractFunction {}

export type Intercept<
  K extends AbstractClass | typeof AbstractFunction,
  TReturn
> = K extends typeof AbstractFunction
  ? InterceptFunction<K['prototype'], TReturn>
  : InterceptMethod<K, TReturn>;

export type InterceptMethod<K extends AbstractClass, TReturn> = <
  TProp extends keyof K['prototype'],
  TMethodName extends HasMethod<K['prototype'], TProp>,
  TInput extends unknown[]
>(
  method: TMethodName,
  ...callableArgs: TInput & InterceptCallableInput<K['prototype'][TMethodName], TInput>
) => TReturn;

export type InterceptFunction<K extends AnyFunction, TReturn> = <TInput extends unknown[]>(
  ...callableArgs: TInput & InterceptCallableInput<K, TInput>
) => TReturn;

// Helpers

export type Before = <TMethod extends AnyFunction, TInput extends unknown[]>(
  ...callableArgs: CallableInput<Parameters<TMethod>, [], Parameters<TMethod>[0], TInput>
) => CallableFunction<Parameters<TMethod>, [], ReturnType<TMethod>>;

export const before = callableSetter().map(
  (callable) =>
    new DynamicCallable((passedArgs, container: ServiceLocator, sink?: EventSink) => {
      passedArgs[0] = callable.call(passedArgs as [], container, sink);
      return (this as any).call(passedArgs, container, sink);
    }),
);

export type TeeBefore<TMethod extends AnyFunction, TInput extends unknown[]> = (
  ...callableArgs: CallableInput<Parameters<TMethod>, [], unknown, TInput>
) => CallableFunction<[InterceptContext<TMethod>], [], ReturnType<TMethod>>;

export type OldIntercept<TMethod extends AnyFunction, TInput extends unknown[]> = (
  ...callableArgs: CallableInput<
    [...Parameters<TMethod>, (...args: Parameters<TMethod>) => ReturnType<TMethod>],
    [],
    ReturnType<TMethod>,
    TInput
  >
) => CallableFunction<[InterceptContext<TMethod>], [], ReturnType<TMethod>>;

export type TeeIntercept<TMethod extends AnyFunction, TInput extends unknown[]> = (
  ...callableArgs: CallableInput<
    [...Parameters<TMethod>, (...args: Parameters<TMethod>) => unknown],
    [],
    ReturnType<TMethod>,
    TInput
  >
) => CallableFunction<[InterceptContext<TMethod>], [], ReturnType<TMethod>>;

export type After<TMethod extends AnyFunction, TInput extends unknown[]> = (
  ...callableArgs: CallableInput<[ReturnType<TMethod>], [], ReturnType<TMethod>, TInput>
) => CallableFunction<[InterceptContext<TMethod>], [], ReturnType<TMethod>>;

export type TeeAfter<TMethod extends AnyFunction, TInput extends unknown[]> = (
  ...callableArgs: CallableInput<[ReturnType<TMethod>], [], void, TInput>
) => CallableFunction<[InterceptContext<TMethod>], [], ReturnType<TMethod>>;
