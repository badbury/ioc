export abstract class Resolver<T, K = any> {
  constructor(public key: K) {}
  abstract resolve(container: ServiceLocator): T;
}

export abstract class ServiceLocator {
  abstract get<T extends { prototype: any }>(type: T): T['prototype'];
}

export class DependencyResolver implements ServiceLocator {
  private mappings: Map<any, Resolver<any>> = new Map();
  constructor(definitions: any[]) {
    for (const definition of definitions) {
      if (definition instanceof Resolver) {
        this.mappings.set(definition.key, definition);
      }
    }
  }
  get<T extends { prototype: any }>(type: T): T['prototype'] {
    return this.mappings.get(type)?.resolve(this);
  }
}

type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

export type PartialResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  P extends TypeParams<T>
> = {
  with(...args: P): Resolver<T>;
};

type AsConstructors<T extends any[]> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: (Function & { prototype: T[K] }) | Resolver<T[K]>;
};

type TypeParams<T extends ClassLike<T>> = T extends new (...args: infer P) => any
  ? AsConstructors<P>
  : never;

export class BindResolver<T extends ClassLike<T>, K = T, P extends TypeParams<T> = TypeParams<T>>
  extends Resolver<T, K>
  implements PartialResolver<T, P> {
  protected instance?: InstanceType<T>;

  constructor(public key: K, public type: T, private args: P | [] = []) {
    super(key);
  }

  resolve(container: ServiceLocator): T {
    if (this.instance) {
      return this.instance;
    }
    const args = [];
    for (const arg of this.args) {
      args.push(arg instanceof Resolver ? arg.resolve(container) : container.get(arg));
    }
    return (this.instance = new this.type(...args));
  }

  with(...args: P): BindResolver<T, K, P> {
    return new BindResolver(this.key, this.type, args);
  }

  to<N>(key: N): BindResolver<T, N, P> {
    return new BindResolver(key, this.type, this.args);
  }
}

export class TransformResolver<T extends ClassLike<T>, N, K> extends Resolver<N> {
  private instance?: N;

  constructor(
    public key: K,
    private next: Resolver<T>,
    private transform: (t: InstanceType<T>) => N,
  ) {
    super(key);
  }

  resolve(container: ServiceLocator): N {
    if (this.instance) {
      return this.instance;
    }
    const instance = this.next.resolve(container);
    return (this.instance = this.transform(instance as any));
  }
}

export class LookupResolver<T extends ClassLike<T>> extends Resolver<T> {
  resolve(container: ServiceLocator): T {
    return container.get(this.key);
  }

  map<N>(transform: (t: InstanceType<T>) => N): Resolver<N> {
    return new TransformResolver(this.key, this, transform);
  }
}

export class ValueResolver<T, K> extends Resolver<T, K> {
  constructor(public key: K, private value: T) {
    super(key);
  }

  resolve(): T {
    return this.value;
  }
}

export function bind<T extends ClassLike<T>>(type: T): BindResolver<T> {
  return new BindResolver(type, type);
}

export function lookup<T extends ClassLike<T>>(type: T): LookupResolver<T> {
  return new LookupResolver(type);
}

export function value<T>(value: T): ValueResolver<T, T> {
  return new ValueResolver(value, value);
}
