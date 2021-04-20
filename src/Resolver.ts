import { Container, Resolver } from './Container';

export type PartialResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  P extends TypeParams<T>
> = {
  with(...args: P): Resolver<T>;
};

type AsConstructors<T extends any[]> = {
  [K in keyof T]: (new (...args: any[]) => T[K]) | Resolver<T[K]>;
};

type TypeParams<T extends new (...args: any[]) => any> = T extends new (...args: infer P) => any
  ? AsConstructors<P>
  : never;

export class BindResolver<
    T extends new (...args: any[]) => InstanceType<T>,
    K = T,
    P extends TypeParams<T> = TypeParams<T>
  >
  extends Resolver<T, K>
  implements PartialResolver<T, P> {
  protected instance?: InstanceType<T>;

  constructor(public key: K, public type: T, private args: P | [] = []) {
    super(key);
  }

  resolve(container: Container): T {
    if (this.instance) {
      return this.instance;
    }
    const args = [];
    for (const arg of this.args) {
      args.push(arg instanceof Resolver ? arg.resolve(container) : container.get(arg));
    }
    return (this.instance = new this.type(...args));
  }

  with(...args: P): Resolver<T> {
    return new BindResolver(this.key, this.type, args);
  }

  to<N>(key: N): Resolver<T, N> {
    return new BindResolver(key, this.type, this.args);
  }
}

export class TransformResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  N,
  K
> extends Resolver<N> {
  private instance?: N;

  constructor(
    public key: K,
    private next: Resolver<T>,
    private transform: (t: InstanceType<T>) => N,
  ) {
    super(key);
  }

  resolve(container: Container): N {
    if (this.instance) {
      return this.instance;
    }
    const instance = this.next.resolve(container);
    return (this.instance = this.transform(instance as any));
  }
}

export class LookupResolver<T extends new (...args: any[]) => InstanceType<T>> extends Resolver<T> {
  resolve(container: Container): T {
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
