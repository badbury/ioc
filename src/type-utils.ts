export type HasPrototype<T> = { prototype: T };
// eslint-disable-next-line @typescript-eslint/ban-types
export type AbstractClass<T extends HasPrototype<T> = any> = Function & {
  prototype: T['prototype'];
};
export type Newable<T = any, P extends any[] = any[]> = new (...args: P) => T;
export type ClassLike<T extends Newable<T>> = Newable<InstanceType<T>>;

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
