import { Definition } from './container';
import { bind } from './injector';
import { DynamicEventSink, on } from './events';
import { ListnerFunctions } from './events';
import { ClassLike } from './type-utils';

export class LifecycleModule {
  register(): Definition[] {
    return [
      bind(LifecycleDispatcher).with(DynamicEventSink),
      on(Startup).dispatchWith(LifecycleDispatcher, 'startupDispatcher'),
      on(Shutdown).dispatchWith(LifecycleDispatcher, 'shutdownDispatcher'),
    ];
  }
}

/****** Startup Events  ******/

// The app is starting up, let modules do any early checks and connect to backing services
export class Startup {}

// Connect any IO like http listeners and timers
export class Connect {}

// The application is ready for normal operations
export class Ready {}

/****** Shutdown Events  ******/

// Register the intent to shutdown and do any early cleanup
export class Shutdown {
  constructor(
    public readonly reason: string,
    public readonly exitCode: number | false = false,
    public readonly error?: Error,
  ) {}
}

// Disconnect any IO like http listeners and timers
export class Disconnect {
  constructor(public readonly shutdown: Shutdown) {}
}
// After all connections have been drained do some last second cleanup before exit
export class CleanUp {
  constructor(public readonly shutdown: Shutdown) {}
}
// Exit the application
export class Exit {
  constructor(public readonly shutdown: Shutdown) {}
}

class LifecycleDispatcher {
  constructor(private emit: DynamicEventSink) {}

  async startupDispatcher(
    startup: Startup,
    listeners: ListnerFunctions<typeof Startup>,
  ): Promise<void> {
    await this.awaitAllListeners(startup, listeners);
    await this.emit(new Connect());
    await this.emit(new Ready());
  }

  async shutdownDispatcher(
    shutdown: Shutdown,
    listeners: ListnerFunctions<typeof Shutdown>,
  ): Promise<void> {
    await this.awaitAllListeners(shutdown, listeners);
    await this.emit(new Disconnect(shutdown));
    await this.emit(new CleanUp(shutdown));
    await this.emit(new Exit(shutdown));
  }

  async awaitAllListeners<T extends ClassLike<T>>(
    subject: InstanceType<T>,
    listeners: ListnerFunctions<T>,
  ): Promise<void> {
    await Promise.all(listeners.map(async (listener) => listener(subject)));
  }
}
