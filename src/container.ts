import { DependencyResolver, ServiceLocator, ValueResolver } from './dependency-injection';
import { EventBus, EventSink, DynamicEventSink } from './events';

export type Definition<T = any> = {
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
  private defintions: Definition[];
  private events: EventBus;
  private resolver: ServiceLocator;

  constructor(modules: Module[]) {
    this.defintions = modules.map((module) => module.register()).reduce((a, b) => a.concat(b), []);
    this.events = new EventBus(this, this.defintions);
    this.defintions.push(new ValueResolver(EventSink, this.events));
    this.defintions.push(new ValueResolver(DynamicEventSink, this.events));
    this.defintions.push(new ValueResolver(Container, this));
    this.defintions.push(new ValueResolver(ServiceLocator, this));
    this.resolver = new DependencyResolver(this.defintions);
    this.events.emit(new RegisterDefinitions(this.defintions, this));
  }

  get<T extends { prototype: any }>(type: T): T['prototype'] {
    return this.resolver.get(type);
  }

  emit<T>(subject: T): void {
    return this.events.emit(subject);
  }
}
