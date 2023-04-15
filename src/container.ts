import { bind, DependencyResolver } from './injector';
import { EventBus } from './events';
import { LifecycleModule, Shutdown, Startup } from './lifecycle';
import { Definition, ServiceLocator, ResolverSink, EventSink, EmitEvent } from './contracts';

export interface Module {
  register(): Definition[];
}

export class RegisterDefinitions {
  constructor(public readonly definitions: Definition[], public readonly container: Container) {}
}

export class Container implements EventSink, ServiceLocator {
  private events: EventBus;
  private resolver: DependencyResolver;

  constructor(modules: Module[]) {
    modules.unshift(new LifecycleModule());
    const definitions = modules
      .map((module) => module.register())
      .reduce((a, b) => a.concat(b), []);
    this.events = new EventBus(this, definitions);
    definitions.push(bind(EventSink).value(this.events));
    definitions.push(bind(EmitEvent).value(this.events.emit.bind(this.events)));
    definitions.push(bind(Container).value(this));
    definitions.push(bind(ServiceLocator).value(this));
    this.resolver = new DependencyResolver(definitions);
    const resolverDefinitions = bind(ResolverSink).value(this.resolver);
    this.resolver.register(resolverDefinitions);
    definitions.push(resolverDefinitions);
    this.events.emit(new RegisterDefinitions(definitions, this));
  }

  get<T extends { prototype: unknown }>(type: T): T['prototype'] {
    return this.resolver.get(type);
  }

  emit<T>(subject: T): unknown {
    return this.events.emit(subject);
  }

  async startup(): Promise<unknown> {
    return this.events.emit(new Startup());
  }

  async shutdown(
    reason: string,
    exitCode: number | false = false,
    error?: Error,
  ): Promise<unknown> {
    return this.events.emit(new Shutdown(reason, exitCode, error));
  }
}

export function container(...modules: Module[]): Container {
  return new Container(modules);
}

export function bundle(...definitions: Definition[]): Module {
  return { register: () => definitions };
}
