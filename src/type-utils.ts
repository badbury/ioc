export type HasPrototype<T = unknown> = { prototype: T };
// eslint-disable-next-line @typescript-eslint/ban-types
export type AbstractClass<T extends HasPrototype = HasPrototype> = Function & {
  prototype: T['prototype'];
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Newable<T = any, P extends any[] = any[]> = new (...args: P) => T;
export type ClassLike = new (...args: never[]) => unknown;

export type AllInstanceType<T extends AbstractClass[]> = {
  [K in keyof T]: T[K] extends { prototype: infer V } ? V : never;
};

export type Method<TClass, TArgs, TReturn = unknown> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (...args: infer E) => TReturn
    ? E extends TArgs
      ? TProperty
      : never
    : never;
}[keyof TClass];

export type HasMethod<TClass, TMethod extends keyof TClass> = TClass[TMethod] extends AnyFunction
  ? TMethod
  : never;
