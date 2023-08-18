import {
  Callable,
  CallableSetter,
  callableSetter,
} from "./callable/callable.ts";
import {
  Definition,
  EventSink,
  EventStream,
  ResolverMiddleware,
  ResolverSink,
  ServiceLocator,
} from "./contracts.ts";
import {
  MethodAfter,
  MethodBefore,
  MethodIntercept,
  MethodModifierMiddleware,
  MethodTeeAfter,
  MethodTeeBefore,
  MethodTeeIntercept,
} from "./callable/method_modifier.ts";
import { AbstractClass, ClassLike, HasMethod, Newable } from "./type_utils.ts";

export type KeysMatching<T, V> = T extends number ? never
  : T extends string ? never
  : T extends boolean ? never
  : T extends null ? never
  : T extends undefined ? never
  : { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export class CouldNotResolve extends Error {
  public subjectName: unknown;
  public asString: unknown;
  constructor(
    public subject: {
      prototype: unknown;
      name?: string;
      toString?: () => string;
    },
  ) {
    super();
    this.asString = subject.toString ? subject.toString() : "";
    this.subjectName = subject.name;
  }
}

export abstract class Resolver<T, K = T> implements Definition<Resolver<T, K>> {
  definition = Resolver;

  constructor(
    public key: K,
    protected middlewares: ResolverMiddleware<K>[],
    protected eventStreamProps: unknown[], // KeysMatching<K, EventStream>[],
  ) {}

  abstract resolve(container: ServiceLocator): T;

  public resolveWithMiddleware(container: ServiceLocator): T {
    const stack =
      ([...this.middlewares].reverse() as unknown) as ResolverMiddleware<T>[];
    let next = this.resolve.bind(this, container);
    for (const middleware of stack) {
      next = middleware.resolve.bind(middleware, container, next);
    }
    const subject = next();
    this.bindEventStreams(subject, container);
    return subject;
  }

  protected bindEventStreams(subject: T, container: ServiceLocator): void {
    if (this.eventStreamProps.length === 0) {
      return;
    }
    const sink = container.get(EventSink);
    for (const eventStreamProp of this.eventStreamProps) {
      const eventStream = (subject[
        (eventStreamProp as unknown) as KeysMatching<T, EventStream>
      ] as unknown) as EventStream;
      eventStream.on(sink.emit.bind(sink));
    }
  }

  protected getMethodModifierMiddleware<
    N extends keyof K,
    M extends HasMethod<K, N>,
  >(
    method: M,
  ): MethodModifierMiddleware<K & Record<M, () => unknown>, N, M> {
    for (const x of this.middlewares) {
      if (x instanceof MethodModifierMiddleware && x.key === method) {
        return x;
      }
    }
    const middleware = new MethodModifierMiddleware<
      K & Record<M, () => unknown>,
      N,
      M
    >(method);
    this.middlewares.push(middleware);
    return middleware;
  }
}

export class DependencyResolver implements ServiceLocator, ResolverSink {
  private mappings: Map<unknown, Resolver<unknown>> = new Map();

  constructor(definitions: Definition[]) {
    for (const definition of definitions) {
      if (definition instanceof Resolver) {
        this.register(definition);
      }
    }
  }

  get<T extends { prototype: unknown }>(type: T): T["prototype"] {
    const resolver = this.mappings.get(type);
    if (!resolver) {
      throw new CouldNotResolve(type);
    }
    return resolver.resolveWithMiddleware(this);
  }

  register(resolver: Resolver<unknown>): void {
    this.mappings.set(resolver.key, resolver);
  }
}

type BindReturn<T extends AbstractClass<T>, K extends AbstractClass<K> = T> =
  T extends Newable ? T extends new () => unknown ? BindResolver<T, K>
    : NeedsArgumentsResolver<T, K>
    : AbstractResolver<K>;

export type ListenTo<T extends AbstractClass, TReturn> = (
  ...methods: KeysMatching<T["prototype"], EventStream>[]
) => TReturn;

export type AbstractResolver<K extends AbstractClass<K>> = {
  to<N extends ClassLike & K>(type: N): BindReturn<N, K>;
  value<N extends K["prototype"]>(value: N): ValueResolver<N, K>;
  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A>;
  factory: CallableSetter<[], [], K["prototype"], FactoryResolver<K, []>>;
  // Method Modifiers
  listenTo: ListenTo<K, AbstractResolver<K>>;
  before: MethodBefore<K, AbstractResolver<K>>;
  teeBefore: MethodTeeBefore<K, AbstractResolver<K>>;
  intercept: MethodIntercept<K, AbstractResolver<K>>;
  teeIntercept: MethodTeeIntercept<K, AbstractResolver<K>>;
  after: MethodAfter<K, AbstractResolver<K>>;
  teeAfter: MethodTeeAfter<K, AbstractResolver<K>>;
};

export type NeedsArgumentsResolver<
  T extends ClassLike,
  K extends AbstractClass<K> & AbstractClass<T> = T,
  P extends TypeParams<T> = TypeParams<T>,
> = {
  with(...args: P): BindResolver<T, K, P>;
  value<N extends K["prototype"]>(value: N): ValueResolver<N, K>;
  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A>;
  factory: CallableSetter<[], [], K["prototype"], FactoryResolver<K, []>>;
  // Method Modifiers
  listenTo: ListenTo<K, NeedsArgumentsResolver<T, K, P>>;
  before: MethodBefore<K, NeedsArgumentsResolver<T, K, P>>;
  teeBefore: MethodTeeBefore<K, NeedsArgumentsResolver<T, K, P>>;
  intercept: MethodIntercept<K, NeedsArgumentsResolver<T, K, P>>;
  teeIntercept: MethodTeeIntercept<K, NeedsArgumentsResolver<T, K, P>>;
  after: MethodAfter<K, NeedsArgumentsResolver<T, K, P>>;
  teeAfter: MethodTeeAfter<K, NeedsArgumentsResolver<T, K, P>>;
};

type AsConstructors<T extends unknown[]> = {
  [K in keyof T]: // deno-lint-ignore ban-types
    | (Function & { prototype: PrimitiveToClass<T[K]> })
    | Resolver<PrimitiveToClass<T[K]>, unknown>;
};

type PrimitiveToClass<T> = T extends string // deno-lint-ignore ban-types
  ? String
  : T extends number // deno-lint-ignore ban-types
    ? Number
  : T extends boolean // deno-lint-ignore ban-types
    ? Boolean
  : T;

type TypeParams<T extends ClassLike> = T extends
  new (...args: infer P) => unknown ? AsConstructors<P>
  : never;

export class SingletonMiddleware<T> implements ResolverMiddleware<T> {
  private instance: T | undefined;

  resolve(
    container: ServiceLocator,
    next: (container: ServiceLocator) => T,
  ): T {
    if (this.instance) {
      return this.instance;
    }
    this.instance = next(container);
    return this.instance;
  }
}

export class BindResolver<
  T extends ClassLike,
  K extends AbstractClass<K> & AbstractClass<T> = T,
  P extends TypeParams<T> = TypeParams<T>,
> extends Resolver<T, K>
  implements AbstractResolver<K>, NeedsArgumentsResolver<T, K, P> {
  protected instance?: InstanceType<T>;

  constructor(
    public key: K,
    protected middlewares: ResolverMiddleware<K>[],
    protected eventStreamProps: KeysMatching<K, EventStream>[],
    public type: T,
    private args: P | [] = [],
  ) {
    super(key, middlewares, eventStreamProps);
  }

  resolve(container: ServiceLocator): T {
    const args = [] as unknown[];
    for (const arg of this.args) {
      args.push(
        arg instanceof Resolver ? arg.resolve(container) : container.get(arg),
      );
    }
    const type = this.type;
    return new type(...(args as never[])) as T;
  }

  with(...args: P): BindResolver<T, K, P> {
    return new BindResolver(
      this.key,
      this.middlewares,
      this.eventStreamProps,
      this.type,
      args,
    );
  }

  to<N extends ClassLike & K>(type: N): BindReturn<N, K> {
    return new BindResolver(
      this.key,
      this.middlewares,
      this.eventStreamProps,
      type,
      [],
    ) as BindReturn<N, K>;
  }

  value<N extends K["prototype"]>(value: N): ValueResolver<N, K> {
    return new ValueResolver(
      this.key,
      value,
      this.middlewares,
      this.eventStreamProps,
    );
  }

  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A> {
    return new FactoryBuilder(
      this.key,
      this.middlewares,
      this.eventStreamProps,
      args,
    );
  }

  factory = callableSetter()
    .withReturn<K["prototype"]>()
    .map(
      (callable) =>
        new FactoryResolver(
          this.key,
          this.middlewares,
          this.eventStreamProps,
          callable,
        ),
    );

  // Method Modifiers

  listenTo: ListenTo<K, this> = (...methods): this => {
    this.eventStreamProps.push(...methods);
    return this;
  };

  before: MethodBefore<K, this> = (method, ...callableArgs): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.before(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };

  teeBefore: MethodTeeBefore<K, this> = (method, ...callableArgs): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.teeBefore(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };

  intercept: MethodIntercept<K, this> = (method, ...callableArgs): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.intercept(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };

  teeIntercept: MethodTeeIntercept<K, this> = (
    method,
    ...callableArgs
  ): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.teeIntercept(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };

  after: MethodAfter<K, this> = (method, ...callableArgs): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.after(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };

  teeAfter: MethodTeeAfter<K, this> = (method, ...callableArgs): this => {
    this.getMethodModifierMiddleware(method).withModifier((callable) =>
      callable.teeAfter(callableArgs[0], callableArgs[1] as never)
    );
    return this;
  };
}

export class FactoryBuilder<
  T extends AbstractClass<T>,
  A extends AbstractClass[] = [],
> {
  public factory: CallableSetter<[], A, T["prototype"], FactoryResolver<T, A>>;

  constructor(
    public key: T,
    protected middlewares: ResolverMiddleware<T>[],
    protected eventStreamProps: KeysMatching<T, EventStream>[],
    public args: A = ([] as unknown) as A,
  ) {
    this.factory = callableSetter()
      .withContainerArgs<A>(this.args)
      .withReturn<T["prototype"]>()
      .map(
        (callable) =>
          new FactoryResolver(
            this.key,
            this.middlewares,
            this.eventStreamProps,
            callable,
          ),
      );
  }
}

export class FactoryResolver<
  T extends AbstractClass<T>,
  P extends AbstractClass[],
> extends Resolver<T, T> {
  constructor(
    public key: T,
    protected middlewares: ResolverMiddleware<T>[],
    protected eventStreamProps: KeysMatching<T, EventStream>[],
    private callable: Callable<[], P, T["prototype"]>,
  ) {
    super(key, middlewares, eventStreamProps);
  }

  resolve(container: ServiceLocator): T["prototype"] {
    return this.callable.call([], container);
  }
}

export class TransformResolver<T extends AbstractClass<T>, N, K>
  extends Resolver<N, K> {
  constructor(
    public key: K,
    protected middlewares: ResolverMiddleware<K>[],
    protected eventStreamProps: KeysMatching<K, EventStream>[],
    private next: Resolver<T>,
    private transform: (t: T["prototype"]) => N,
  ) {
    super(key, middlewares, eventStreamProps);
  }

  resolve(container: ServiceLocator): N {
    return this.transform(this.next.resolveWithMiddleware(container));
  }
}

export class LookupResolver<T extends AbstractClass<T>> extends Resolver<T, T> {
  resolve(container: ServiceLocator): T {
    return container.get(this.key);
  }

  map<N>(transform: (t: T["prototype"]) => N): Resolver<N, T> {
    return new TransformResolver(this.key, [], [], this, transform);
  }
}

export class ValueResolver<T, K> extends Resolver<T, K> {
  constructor(
    public key: K,
    private value: T,
    protected middlewares: ResolverMiddleware<K>[] = [],
    protected eventStreamProps: KeysMatching<K, EventStream>[] = [],
  ) {
    super(key, middlewares, eventStreamProps);
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
  const bindResolver = new BindResolver(key, middlewares, [], type) as unknown;
  return bindResolver as BindReturn<T, T>;
}

export function lookup<T extends AbstractClass<T>>(type: T): LookupResolver<T> {
  const middlewares = defaultMiddlewares<T>();
  return new LookupResolver(type, middlewares, []);
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
