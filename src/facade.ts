import { EventListenerBuilder } from './Listener';
import { BindResolver, LookupResolver } from './Resolver';

type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

export function bind<T extends ClassLike<T>>(type: T): BindResolver<T> {
  return new BindResolver(type);
}

export function lookup<T extends ClassLike<T>>(type: T): LookupResolver<T> {
  return new LookupResolver(type);
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}
