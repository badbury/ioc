import {
  DependencyResolver,
  ResolverSink,
  ServiceLocator,
  ValueResolver,
} from './dependency-injection';
import { EventBus, EventSink, DynamicEventSink } from './events';

export class Shutdown {
  constructor(
    public readonly exitCode: number | false,
    public readonly reason: string,
    public readonly error?: Error,
  ) {}
}

export class Startup {}

export type Definition<T = unknown> = {
  definition: { prototype: T };
  constructor: { prototype: T };
};

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
    const defintions = modules.map((module) => module.register()).reduce((a, b) => a.concat(b), []);
    this.events = new EventBus(this, defintions);
    defintions.push(new ValueResolver(EventSink, this.events));
    defintions.push(new ValueResolver(DynamicEventSink, this.events));
    defintions.push(new ValueResolver(Container, this));
    defintions.push(new ValueResolver(ServiceLocator, this));
    this.resolver = new DependencyResolver(defintions);
    this.resolver.register(new ValueResolver(ResolverSink, this.resolver));
    this.events.emit(new RegisterDefinitions(defintions, this));
    this.events.emit(new Startup());
  }

  get<T extends { prototype: unknown }>(type: T): T['prototype'] {
    return this.resolver.get(type);
  }

  emit<T>(subject: T): unknown {
    return this.events.emit(subject);
  }
}
