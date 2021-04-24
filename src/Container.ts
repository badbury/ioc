import { DependencyResolver, ServiceLocator, ValueResolver } from './dependency-injection';
import { EventBus, EventSink } from './events';

export interface Module {
  register(): any[];
}

export class RegisterDefinitions {
  constructor(public readonly definitions: any[], public readonly container: Container) {}
}

export class Container implements EventSink, ServiceLocator {
  defintions: any[];
  events: EventSink;
  resolver: ServiceLocator;

  constructor(modules: Module[]) {
    this.defintions = modules.map((module) => module.register()).reduce((a, b) => a.concat(b), []);
    this.defintions.push(Container, new ValueResolver(Container, this));
    this.defintions.push(ServiceLocator, new ValueResolver(ServiceLocator, this));
    this.defintions.push(EventSink, new ValueResolver(EventSink, this));
    this.resolver = new DependencyResolver(this.defintions);
    this.events = new EventBus(this, this.defintions);
    this.events.emit(new RegisterDefinitions(this.defintions, this));
  }

  get<T extends { prototype: any }>(type: T): T['prototype'] {
    return this.resolver.get(type);
  }

  emit<T>(subject: T): void {
    return this.events.emit(subject);
  }
}
