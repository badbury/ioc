import { Definition, EmitEvent } from "./contracts.ts";
import { bind } from "./injector.ts";
import { ListnerFunctions, on } from "./events.ts";
import { ClassLike } from "./type_utils.ts";

export class LifecycleModule {
  register(): Definition[] {
    return [
      bind(LifecycleDispatcher).with(EmitEvent),
      on(Startup).dispatchWith(LifecycleDispatcher, "startupDispatcher"),
      on(Shutdown).dispatchWith(LifecycleDispatcher, "shutdownDispatcher"),
    ];
  }
}

/****** Startup Events ******/

// The app is starting up, let modules do any early checks and connect to backing services
export class Startup {}

// The application is ready for normal operations
export class Ready {}

/****** Shutdown Events ******/

// Register the intent to shutdown and do any early cleanup
export class Shutdown {
  constructor(
    public readonly reason: string,
    public readonly exitCode: number | false = false,
    public readonly error?: Error,
  ) {}
}

// Exit the application
export class Exit {
  constructor(public readonly shutdown: Shutdown) {}
}

class LifecycleDispatcher {
  constructor(private emit: EmitEvent) {}

  async startupDispatcher(
    startup: Startup,
    listeners: ListnerFunctions<typeof Startup>,
  ): Promise<void> {
    await this.awaitAllListeners(startup, listeners);
    await this.emit(new Ready());
  }

  async shutdownDispatcher(
    shutdown: Shutdown,
    listeners: ListnerFunctions<typeof Shutdown>,
  ): Promise<void> {
    await this.awaitAllListeners(shutdown, listeners);
    await this.emit(new Exit(shutdown));
  }

  async awaitAllListeners<T extends ClassLike>(
    subject: InstanceType<T>,
    listeners: ListnerFunctions<T>,
  ): Promise<void> {
    await Promise.all(listeners.map((listener) => listener(subject)));
  }
}
