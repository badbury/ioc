// @TODO:
// - Implement recursive loop checks
// -

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

export class Container {
  private mappings: Map<any, Resolver<any>> = new Map();
  private listeners: Map<any, Listener<any>[]> = new Map();

  constructor(modules: Module[]) {
    modules.forEach((module) =>
      module.register().forEach((definition) => {
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
