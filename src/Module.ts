// @TODO:
// - Implement recursive loop checks
// -

export class Container {
  private mappings: Map<any, Resolver<any>> = new Map();
  private listeners: Map<any, Listener<any>[]> = new Map();

  constructor(modules: Module[]) {
    modules.forEach((module) =>
      module.register().forEach((definition: Resolver<any> | Listener<any>) => {
        if (definition instanceof Resolver) {
          this.mappings.set(definition.key, definition);
        } else {
          const handlers = this.listeners.get(definition.key) || [];
          handlers.push(definition);
          this.listeners.set(definition.key, handlers);
        }
      }),
    );
  }

  get<T>(type: new (...args: any[]) => T): T {
    return this.mappings.get(type as any)?.resolve(this);
  }

  emit<T>(subject: T): void {
    this.listeners
      .get((subject as any).constructor as any)
      ?.map((handler) => handler.handle(subject, this));
  }
}

export type PartialResolver<
  T extends new (...args: any[]) => InstanceType<T>,
  P extends TypeParams<T>
> = {
  with(...args: P): Resolver<T>;
};

export abstract class Resolver<T, K = any> {
  constructor(public key: K) {}
  abstract resolve(container: Container): T;
}

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

export class LookupResolver<T extends new (...args: any[]) => InstanceType<T>>
  implements Resolver<T> {
  constructor(public key: T) {}

  resolve(container: Container): T {
    return container.get(this.key);
  }
}

type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;

type MethodOf<
  TClassType extends Constructor,
  TSubjectType extends Constructor,
  TClass = InstanceType<TClassType>,
  TSubject = InstanceType<TSubjectType>
> = {
  [TProperty in keyof TClass]: TClass[TProperty] extends (arg: infer U) => any
    ? U extends TSubject
      ? TProperty
      : never
    : never;
}[keyof TClass];

export abstract class Listener<T> {
  constructor(public key: T) {}
  abstract handle(subject: T, container: Container): void;
}

export class EventListenerBuilder<T extends new (...args: any[]) => InstanceType<T>> {
  constructor(public key: T) {}

  do(target: (subject: InstanceType<T>) => void): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T>>(target: C, method: M): Listener<T>;
  do<C extends Constructor, M extends MethodOf<C, T>>(
    target: C | ((subject: InstanceType<T>) => void),
    method?: M,
  ): Listener<T> {
    return method
      ? new ClassEventListener(this.key, target as C, method)
      : new FunctionEventListener(this.key, target as (subject: InstanceType<T>) => void);
  }
}

export class ClassEventListener<
  T extends new (...args: any[]) => InstanceType<T>,
  V extends Constructor,
  M extends MethodOf<V, T>
> extends Listener<T> {
  constructor(public key: T, private listenerClass: V, private listenerMethod: M) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: Container): void {
    const handler = container.get(this.listenerClass);
    handler[this.listenerMethod](subject);
  }
}

export class FunctionEventListener<
  T extends new (...args: any[]) => InstanceType<T>
> extends Listener<T> {
  constructor(public key: T, private handler: (subject: InstanceType<T>) => any) {
    super(key);
  }

  handle(subject: InstanceType<T>, container: Container): void {
    this.handler(subject);
  }
}

function bind<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new BindResolver(type);
}
function from<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new FromResolver(type);
}
function ref<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new LookupResolver(type);
}
function on<T extends new (...args: any[]) => InstanceType<T>>(type: T) {
  return new EventListenerBuilder(type);
}

export interface Module {
  register(): (Resolver<any> | Listener<any>)[];
}

class MyConfig {
  url = 'https://example.org';
}

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

class Baz {
  constructor(public name: string) {}
}

class Box {
  badMethod(str: string) {
    console.log(str);
  }
  process(baz: Baz) {
    console.log('Box class processing........', baz);
  }
}

export class MyModule {
  register(): (Resolver<any> | Listener<any>)[] {
    return [
      bind(Bar),
      bind(Foo).with(
        Bar,
        from(MyConfig).use((config) => config.url),
      ),
      bind(Box),
      on(Baz).do(Box, 'process'),
      on(Baz).do((b) => console.log('Arrow function processing...', b)),
    ];
  }
}

const m = new MyModule();
const c = new Container([m]);

console.log(c.get(Bar));
const f = c.get(Foo);
console.log(f);
console.log(f.getBar());
c.emit(new Baz('yas'));
