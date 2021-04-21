export abstract class Resolver<T, K = any> {
  constructor(public key: K) {}
  abstract resolve(container: Container): T;
}

export abstract class Listener<T> {
  constructor(public key: T) {}
  abstract handle(subject: T, container: Container): void;
}

export type Definition = Resolver<any> | Listener<any>;

export interface Module {
  register(): Definition[];
}

export abstract class ServiceLocator {
  abstract get<T, C extends { prototype: T }>(type: C): T;
}

export abstract class EventSink {
  abstract emit<T>(subject: T): void;
}

export class Container {
  private mappings: Map<any, Resolver<any>> = new Map();
  private listeners: Map<any, Listener<any>[]> = new Map();

  constructor(modules: Module[]) {
    const containerResolver = new (class extends Resolver<Container> {
      constructor(private value: Container) {
        super(null);
      }

      resolve(): Container {
        return this.value;
      }
    })(this);
    this.mappings.set(Container, containerResolver);
    this.mappings.set(ServiceLocator, containerResolver);
    this.mappings.set(EventSink, containerResolver);
    modules.forEach((module) =>
      module.register().forEach((definition: Definition) => {
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

  get<T, C extends { prototype: T }>(type: C): T {
    return this.mappings.get(type)?.resolve(this);
  }

  emit<T>(subject: T): void {
    this.listeners
      .get((subject as any).constructor as any)
      ?.map((handler) => handler.handle(subject, this));
  }
}
s;
