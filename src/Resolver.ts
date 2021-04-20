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
    P extends TypeParams<T> = TypeParams<T>
  >
  extends Resolver<T, T>
  implements PartialResolver<T, P> {
  private args: P | [] = [];
  protected instance?: InstanceType<T>;

  resolve(container: Container): T {
    if (this.instance) {
      return this.instance;
    }
    const args = [];
    for (const arg of this.args) {
      args.push((arg as any).resolve ? (arg as any).resolve(container) : container.get(arg as any));
    }
    return (this.instance = new this.key(...args));
  }

  with(...args: P): Resolver<T> {
    this.args = args;
    return this;
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
