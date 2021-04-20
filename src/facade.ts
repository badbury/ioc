import { EventListenerBuilder } from './Listener';
import { BindResolver, LookupResolver, ValueResolver } from './Resolver';

type Constructor<T = any, P extends any[] = any[]> = new (...args: P) => T;
type ClassLike<T extends Constructor<T>> = Constructor<InstanceType<T>>;

export function bind<T extends ClassLike<T>>(type: T): BindResolver<T> {
  return new BindResolver(type, type);
}

export function lookup<T extends ClassLike<T>>(type: T): LookupResolver<T> {
  return new LookupResolver(type);
}

export function value<T>(value: T): ValueResolver<T, T> {
  return new ValueResolver(value, value);
}

export function on<T extends ClassLike<T>>(type: T): EventListenerBuilder<T> {
  return new EventListenerBuilder(type);
}
