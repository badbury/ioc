import { Definition } from './container';
import { AbstractClass, AllInstanceType, ClassLike, Newable } from './type-utils';

export abstract class Resolver<T, K = any> implements Definition<Resolver<T, K>> {
  definition = Resolver;
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

export type AbstractResolver<K extends AbstractClass<K>> = {
  to<T extends ClassLike<T> & K>(type: T): BindResolver<T, K>;
  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A>;
  factory(factory: () => K['prototype']): FactoryResolver<K, []>;
};

export type NeedsArgumentsResolver<
  T extends ClassLike<T>,
  K extends AbstractClass<K> & AbstractClass<T> = T,
  P extends TypeParams<T> = TypeParams<T>
> = {
  with(...args: P): BindResolver<T, K, P>;
};

type AsConstructors<T extends any[]> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: (Function & { prototype: T[K] }) | Resolver<T[K]>;
};

type TypeParams<T extends ClassLike<T>> = T extends new (...args: infer P) => any
  ? AsConstructors<P>
  : never;

export class BindResolver<
    T extends ClassLike<T>,
    K extends AbstractClass<K> & AbstractClass<T> = T,
    P extends TypeParams<T> = TypeParams<T>
  >
  extends Resolver<T, K>
  implements AbstractResolver<K> {
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

  to<N extends ClassLike<N> & K>(type: N): BindResolver<N, K, TypeParams<N>> {
    return new BindResolver(this.key, type, []);
  }

  use<A extends AbstractClass[]>(...args: A): FactoryBuilder<K, A> {
    return new FactoryBuilder(this.key, args);
  }

  factory(factory: () => InstanceType<T>): FactoryResolver<K, []> {
    return new FactoryResolver(this.key, [], factory);
  }
}

export class FactoryBuilder<T extends AbstractClass<T>, A extends AbstractClass[] = []> {
  constructor(public key: T, public args: A = ([] as unknown) as A) {}

  factory(factory: (...args: AllInstanceType<A>) => T['prototype']): FactoryResolver<T, A> {
    return new FactoryResolver(this.key, this.args, factory);
  }
}

export class FactoryResolver<
  T extends AbstractClass<T>,
  P extends AbstractClass[]
> extends Resolver<T, T> {
  constructor(
    public key: T,
    private args: P,
    private factory: (...args: AllInstanceType<P>) => T['prototype'],
  ) {
    super(key);
  }

  resolve(container: ServiceLocator): T['prototype'] {
    const args = (this.args.map((arg) =>
      arg instanceof Resolver ? arg.resolve(container) : container.get(arg),
    ) as unknown) as AllInstanceType<P>;
    return this.factory(...args);
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

export function bind<T extends AbstractClass<T>>(
  type: T,
): T extends Newable
  ? T extends new () => any
    ? BindResolver<T, T>
    : NeedsArgumentsResolver<T, T>
  : AbstractResolver<T> {
  return new BindResolver(type, type as any) as any;
}

export function lookup<T extends ClassLike<T>>(type: T): LookupResolver<T> {
  return new LookupResolver(type);
}

export function value<T>(value: T): ValueResolver<T, T> {
  return new ValueResolver(value, value);
}
