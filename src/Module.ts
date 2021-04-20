import 'reflect-metadata';

class Bar {
  one = Math.random();
  constructor() {}
}

class Foo {
  constructor(public bar: Bar, private url: string) {}
  getBar(): Bar {
    return this.bar;
  }
}

// @TODO:
// - Implement recursive loop checks
// -

export class Container {
  private mappings: Map<any, Resolver<any>> = new Map();

  constructor(modules: Module[]) {
    modules.forEach((module) =>
      module.register().forEach((resolver: Resolver<any>) => {
        this.mappings.set(resolver.key, resolver);
      }),
    );
  }

  get<T>(type: new (...args: any[]) => T): T {
    return this.mappings.get(type as any)?.resolve(this);
  }
}

export type PartialResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  P extends TypeParams<T>
> = {
  with(...args: P): Resolver<T>;
};

export type Resolver<T> = {
  key: any;
  resolve(container: Container): T;
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
> implements PartialResolver<T, P> {
  private args: P | [] = [];
  protected instance?: InstanceType<T>;

  constructor(public key: T) {}

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

export class FromResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  P extends TypeParams<T> = TypeParams<T>
> extends BindResolver<T, P> {
  private transform = (id: any) => id;

  resolve(container: Container): T {
    if (this.instance) {
      return this.instance;
    }
    const instance = super.resolve(container);
    return (this.instance = this.transform(instance));
  }

  use<N>(transform: (t: InstanceType<T>) => N): Resolver<N> {
    this.transform = transform;
    return (this as unknown) as Resolver<N>;
  }
}

function bind<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new BindResolver(type);
}
function from<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new FromResolver(type);
}

export interface Module {
  register(): Resolver<any>[];
}

class MyConfig {
  url = 'https://example.org';
}

class Baz {
  constructor(public name: string) {}
}

class Box {
  process(box: Box) {
    console.log(Box);
  }
}

export class MyModule {
  register(): Resolver<any>[] {
    return [
      bind(Bar),
      bind(Foo).with(
        Bar,
        from(MyConfig).use((config) => config.url),
      ),
      on(Baz).run(Box, 'process'),
    ];
  }
}

const m = new MyModule();
const c = new Container([m]);

console.log(c.get(Bar));
const f = c.get(Foo);
console.log(f);
console.log(f.getBar());
