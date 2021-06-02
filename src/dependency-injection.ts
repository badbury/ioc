import { callable, Callable, CallableSetter, callableSetter } from './callable';
import { Definition } from './container';
import { AbstractClass, ClassLike, HasMethod, Newable } from './type-utils';

export abstract class Resolver<T, K = T> implements Definition<Resolver<T, K>> {
  definition = Resolver;

  constructor(public key: K, protected middlewares: ResolverMiddleware<K>[]) {}

  abstract resolve(container: ServiceLocator): T;

  public resolveWithMiddleware(container: ServiceLocator): T {
    const stack = ([...this.middlewares].reverse() as unknown) as ResolverMiddleware<T>[];
    let next = this.resolve.bind(this, container);
    for (const middleware of stack) {
      next = middleware.resolve.bind(middleware, container, next);
    }
    return next();
  }
}

export abstract class ResolverMiddleware<T> {
  abstract resolve(container: ServiceLocator, next: () => T): T;
}

export abstract class ServiceLocator {
  abstract get<T extends { prototype: unknown }>(type: T): T['prototype'];
}

export abstract class ResolverSink {
  abstract register(resolver: Resolver<unknown>): void;
}

export class DependencyResolver implements ServiceLocator {
  private mappings: Map<unknown, Resolver<unknown>> = new Map();
  constructor(definitions: Definition[]) {
    for (const definition of definitions) {
      if (definition instanceof Resolver) {
        this.register(definition);
      }
    }
  }

  get<T extends { prototype: unknown }>(type: T): T['prototype'] {
    return this.mappings.get(type)?.resolveWithMiddleware(this);
  }

  register(resolver: Resolver<unknown>): void {
    this.mappings.set(resolver.key, resolver);
  }
}

type BindReturn<T extends AbstractClass<T>, K extends AbstractClass<K> = T> = T extends Newable
  ? T extends new () => unknown
    ? BindResolver<T, K>
    : NeedsArgumentsResolver<T, K>
  : AbstractResolver<K>;

type CallableFromFn<T extends (...args: unknown[]) => unknown> = Callable<
  Parameters<T>,
  [],
  ReturnType<T>
>;

export type AbstractResolver<K extends AbstractClass<K>> = {
  to<N extends ClassLike<N> & K>(type: N): BindReturn<N, K>;
  value<N extends K['prototype']>(value: N): ValueResolver<N, K>;
  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A>;
  factory: CallableSetter<[], [], K['prototype'], FactoryResolver<K, []>>;
  method<N extends keyof K, M extends HasMethod<K, N>>(
    key: M,
    fn: ModifyCallable<K[M]>,
  ): AbstractResolver<K>;
};

export type NeedsArgumentsResolver<
  T extends ClassLike<T>,
  K extends AbstractClass<K> & AbstractClass<T> = T,
  P extends TypeParams<T> = TypeParams<T>
> = {
  with(...args: P): BindResolver<T, K, P>;
  value<N extends K['prototype']>(value: N): ValueResolver<N, K>;
  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A>;
  factory: CallableSetter<[], [], K['prototype'], FactoryResolver<K, []>>;
  method<N extends keyof K['prototype'], M extends HasMethod<K['prototype'], N>>(
    key: M,
    fn: ModifyCallable<K['prototype'][M]>,
  ): NeedsArgumentsResolver<T, K, P>;
};

type AsConstructors<T extends unknown[]> = {
  [K in keyof T]:  // eslint-disable-next-line @typescript-eslint/ban-types
    | (Function & { prototype: PrimitiveToClass<T[K]> })
    | Resolver<PrimitiveToClass<T[K]>, unknown>;
};

type PrimitiveToClass<T> = T extends string // eslint-disable-next-line @typescript-eslint/ban-types
  ? String
  : T extends number // eslint-disable-next-line @typescript-eslint/ban-types
  ? Number
  : T extends boolean // eslint-disable-next-line @typescript-eslint/ban-types
  ? Boolean
  : T;

type TypeParams<T extends ClassLike<T>> = T extends new (...args: infer P) => unknown
  ? AsConstructors<P>
  : never;

export class SingletonMiddleware<T> implements ResolverMiddleware<T> {
  private instance: T | undefined;

  resolve(container: ServiceLocator, next: (container: ServiceLocator) => T): T {
    if (this.instance) {
      return this.instance;
    }
    this.instance = next(container);
    return this.instance;
  }
}

type ModifyCallable<T extends (...args: unknown[]) => unknown> = (
  method: CallableFromFn<T>,
) => CallableFromFn<T>;

export class MethodModifierMiddleware<T, N extends keyof T, M extends HasMethod<T, N>>
  implements ResolverMiddleware<T> {
  constructor(private key: M, private modifyCallable: ModifyCallable<T[M]>) {}

  resolve(container: ServiceLocator, next: (container: ServiceLocator) => T): T {
    const instance = next(container);

    // eslint-disable-next-line @typescript-eslint/ban-types
    const method = instance[this.key] as T[M] & Function;
    const callableMethod = callable(method.bind(instance)) as CallableFromFn<T[M]>;
    instance[this.key] = this.modifyCallable(callableMethod).compile(container) as T[M];

    return instance;
  }
}

export class BindResolver<
    T extends ClassLike<T>,
    K extends AbstractClass<K> & AbstractClass<T> = T,
    P extends TypeParams<T> = TypeParams<T>
  >
  extends Resolver<T, K>
  implements AbstractResolver<K>, NeedsArgumentsResolver<T, K, P> {
  protected instance?: InstanceType<T>;

  constructor(
    public key: K,
    protected middlewares: ResolverMiddleware<K>[],
    public type: T,
    private args: P | [] = [],
  ) {
    super(key, middlewares);
  }

  resolve(container: ServiceLocator): T {
    const args = [];
    for (const arg of this.args) {
      args.push(arg instanceof Resolver ? arg.resolve(container) : container.get(arg));
    }
    return new this.type(...args);
  }

  with(...args: P): BindResolver<T, K, P> {
    return new BindResolver(this.key, this.middlewares, this.type, args);
  }

  method<N extends keyof K, M extends HasMethod<K, N>>(
    key: M,
    fn: (method: CallableFromFn<K[M]>) => CallableFromFn<K[M]>,
  ): this {
    const middlewares = this.middlewares.concat([new MethodModifierMiddleware(key, fn)]);
    return new BindResolver(this.key, middlewares, this.type, []) as this;
  }

  to<N extends ClassLike<N> & K>(type: N): BindReturn<N, K> {
    return new BindResolver(this.key, this.middlewares, type, []) as BindReturn<N, K>;
  }

  value<N extends K['prototype']>(value: N): ValueResolver<N, K> {
    return new ValueResolver(this.key, value, this.middlewares);
  }

  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A> {
    return new FactoryBuilder(this.key, this.middlewares, args);
  }

  factory = callableSetter()
    .withReturn<K['prototype']>()
    .map((callable) => new FactoryResolver(this.key, this.middlewares, callable));
}

export class FactoryBuilder<T extends AbstractClass<T>, A extends AbstractClass[] = []> {
  constructor(
    public key: T,
    protected middlewares: ResolverMiddleware<T>[],
    public args: A = ([] as unknown) as A,
  ) {}

  factory = callableSetter()
    .withContainerArgs<A>(this.args)
    .withReturn<T['prototype']>()
    .map((callable) => new FactoryResolver(this.key, this.middlewares, callable));
}

export class FactoryResolver<
  T extends AbstractClass<T>,
  P extends AbstractClass[]
> extends Resolver<T, T> {
  constructor(
    public key: T,
    protected middlewares: ResolverMiddleware<T>[],
    private callable: Callable<[], P, T['prototype']>,
  ) {
    super(key, middlewares);
  }

  resolve(container: ServiceLocator): T['prototype'] {
    return this.callable.call([], container);
  }
}

export class TransformResolver<T extends AbstractClass<T>, N, K> extends Resolver<N, K> {
  constructor(
    public key: K,
    protected middlewares: ResolverMiddleware<K>[],
    private next: Resolver<T>,
    private transform: (t: T['prototype']) => N,
  ) {
    super(key, middlewares);
  }

  resolve(container: ServiceLocator): N {
    return this.transform(this.next.resolveWithMiddleware(container));
  }
}

export class LookupResolver<T extends AbstractClass<T>> extends Resolver<T, T> {
  resolve(container: ServiceLocator): T {
    return container.get(this.key);
  }

  map<N>(transform: (t: T['prototype']) => N): Resolver<N, T> {
    return new TransformResolver(this.key, [], this, transform);
  }
}

export class ValueResolver<T, K> extends Resolver<T, K> {
  constructor(
    public key: K,
    private value: T,
    protected middlewares: ResolverMiddleware<K>[] = [],
  ) {
    super(key, middlewares);
  }

  resolve(): T {
    return this.value;
  }
}

function defaultMiddlewares<T>(): ResolverMiddleware<T>[] {
  return [new SingletonMiddleware()];
}

export function bind<T extends AbstractClass<T>>(key: T): BindReturn<T, T> {
  const type = (key as unknown) as new (...args: unknown[]) => T;
  const middlewares = defaultMiddlewares<T>();
  const bindResolver = new BindResolver(key, middlewares, type) as unknown;
  return bindResolver as BindReturn<T, T>;
}

export function lookup<T extends AbstractClass<T>>(type: T): LookupResolver<T> {
  const middlewares = defaultMiddlewares<T>();
  return new LookupResolver(type, middlewares);
}

export function value<T>(value: T): ValueResolver<T, T> {
  const middlewares = defaultMiddlewares<T>();
  return new ValueResolver(value, value, middlewares);
}

// export function resolveMany<T extends ({ prototype: unknown } | Resolver<unknown, unknown>)[]>(
//   container: ServiceLocator,
//   args: T,
// ): any {
//   const resolved = [];
//   for (const arg of args) {
//     resolved.push(arg instanceof Resolver ? arg.resolve(container) : container.get(arg));
//   }
//   return resolved;
// }
