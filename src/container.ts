import { bind, DependencyResolver, Resolver } from './injector';
import { EventBus } from './events';
import { LifecycleModule, Shutdown, Startup } from './lifecycle';
import {
  Definition,
  ServiceLocator,
  ResolverSink,
  EventSink,
  EmitEvent,
  Definitions,
} from './contracts';

export class RegisterDefinitions {
  constructor(public readonly definitions: Definitions, public readonly module: Module) {}
}

export function module(...definitions: Definition[]): new (module?: Module) => Module {
  return class extends Module {
    register(): Definition[] {
      return definitions;
    }
  };
}

export type ModuleConstructor =
  | (new (module?: Module) => Module)
  | (new () => { register: () => Definition[] });

export function include<T extends ModuleConstructor>(child: T): Child<T> {
  return new Child(child);
}

export function global<T extends ModuleConstructor>(child: T): Child<T> {
  return new Child(child).global();
}

type Globals = Map<unknown, Module>;

export class Child<T extends ModuleConstructor> implements Definition<Child<T>> {
  definition = Child;
  private allow: unknown[] = [];
  private allowAll = false;
  public isGlobal = false;

  constructor(public module: T) {}

  build(parent: Module, globals: Globals): Module {
    const parentWrapper = this.buildParentWrapper(parent, globals);
    const child = this.buildChild(parentWrapper);
    if (this.isGlobal) {
      child.provides().map((key) => globals.set(key, child));
    }
    return child;
  }

  buildChild(parent: Module): Module {
    const child = new this.module(parent);
    return child instanceof Module ? child : new (module(...child.register()))(parent);
  }

  buildParentWrapper(parent: Module, globals: Globals): Module {
    const allowAll = this.allowAll;
    const allow = this.allow;
    const parentWrapper = Object.create(parent);
    parentWrapper.has = <T extends { prototype: unknown }>(type: T): boolean => {
      if (globals.has(type)) {
        return true;
      }
      if (allowAll || allow.includes(type)) {
        return parent.has(type);
      }
      return false;
    };
    parentWrapper.get = <T extends { prototype: unknown }>(type: T): T['prototype'] => {
      if (globals.has(type)) {
        return globals.get(type)?.get(type);
      }
      return parent.get(type);
    };
    return parentWrapper;
  }

  offer(...types: unknown[]): Child<T> {
    this.allow.push(...types);
    return this;
  }

  offerEverything(): Child<T> {
    this.allowAll = true;
    return this;
  }

  global(): Child<T> {
    this.isGlobal = true;
    return this;
  }
}

export class Module implements EventSink, ServiceLocator {
  private events: EventSink;
  public readonly resolver: DependencyResolver;

  constructor(parent?: Module) {
    const definitions = new Definitions(this.register());
    definitions.add(bind(EventSink).value(this));
    definitions.add(bind(EmitEvent).value(this.emit.bind(this)));
    definitions.add(bind(Module).value(this));
    definitions.add(bind(ServiceLocator).value(this));
    definitions.add(bind(ResolverSink).value(this));
    const globals: Globals = new Map();
    if (parent) {
      this.events = parent;
      const children = definitions.only(Child).map((child) => child.build(this, globals));
      if (globals.size > 0) {
        throw new Error('Globals are only allowed in the root module');
      }
      this.resolver = new DependencyResolver(definitions, parent, children);
    } else {
      definitions.add(include(LifecycleModule));
      this.events = new EventBus(this, definitions);
      const children = definitions.only(Child).map((child) => child.build(this, globals));
      this.resolver = new DependencyResolver(definitions, null, children);
    }
    this.events.emit(new RegisterDefinitions(definitions, this));
  }

  register(): Definition[] {
    return [];
  }

  get<T extends { prototype: unknown }>(type: T, useParent = false): T['prototype'] {
    return this.resolver.get(type, useParent);
  }

  has<T extends { prototype: unknown }>(type: T): boolean {
    return this.resolver.has(type);
  }

  emit<T>(subject: T): unknown {
    console.log('Emitting', subject, 'from', this, 'using', this.events);
    return this.events.emit(subject);
  }

  addBinding(resolver: Resolver<unknown>): void {
    this.resolver.addBinding(resolver);
    const definitions = new Definitions([resolver]);
    this.events.emit(new RegisterDefinitions(definitions, this));
  }

  provides(): unknown[] {
    return this.resolver.provides();
  }

  async startup(): Promise<unknown> {
    return this.emit(new Startup());
  }

  async shutdown(
    reason: string,
    exitCode: number | false = false,
    error?: Error,
  ): Promise<unknown> {
    return this.events.emit(new Shutdown(reason, exitCode, error));
  }
}

// TIMER DOES NOT HAVE ACCESS TO THE PROVIDERS IT SHOULD TRIGGER
