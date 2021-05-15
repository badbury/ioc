import { Definition } from './container';
import { bind } from './dependency-injection';
import { DynamicEventSink, ListnerFunctions, on } from './events';

export class LifecycleModule {
  constructor() {}

  register(): Definition[] {
    return [
      bind(LifecycleModule),
      bind(NodeSignalHandlers).with(DynamicEventSink),
      on(Shutdown).dispatchWith(async (shutdown, listeners) => {
        await Promise.all(listeners.map(async (listener) => listener(shutdown)));
        console.log(shutdown.reason, shutdown.exitCode);
        shutdown.exit();
      }),
      // on(Shutdown).dispatchWith(LifecycleModule, 'shutdownDispatcher'),
      on(Startup)
        .use(NodeSignalHandlers)
        .do((_, nsh) => nsh.bind()),
      on(Shutdown)
        .use(NodeSignalHandlers)
        .do((_, nsh) => nsh.unbind()),
    ];
  }

  async shutdownDispatcher(
    shutdown: Shutdown,
    listeners: ListnerFunctions<typeof Shutdown>,
  ): Promise<void> {
    await Promise.all(listeners.map(async (listener) => listener(shutdown)));
    console.log(shutdown.reason, shutdown.exitCode);
    shutdown.exit();
  }
}

export class Shutdown {
  constructor(public readonly exitCode: number | false, public readonly reason: string) {}

  async exit(): Promise<void> {
    if (this.exitCode !== false) {
      process.exit(this.exitCode);
    }
  }
}

export class Startup {}

class NodeSignalHandlers {
  constructor(private emit: DynamicEventSink) {}

  bind() {
    process.on('SIGHUP', this.handleSigHup);
    process.on('SIGINT', this.handleSigInt);
    process.on('SIGTERM', this.handleSigTerm);
    process.on('beforeExit', this.handleBeforeExit);
    process.on('uncaughtException', this.handleUncaughtException);
    process.on('unhandledRejection', this.handleUnhandledRejection);
  }

  unbind() {
    process.removeListener('SIGHUP', this.handleSigHup);
    process.removeListener('SIGINT', this.handleSigInt);
    process.removeListener('SIGTERM', this.handleSigTerm);
    process.removeListener('beforeExit', this.handleBeforeExit);
    process.removeListener('uncaughtException', this.handleUncaughtException);
    process.removeListener('unhandledRejection', this.handleUnhandledRejection);
  }

  handleSigHup = () => this.emit(new Shutdown(128 + 1, 'SIGHUP'));
  handleSigInt = () => this.emit(new Shutdown(128 + 2, 'SIGINT'));
  handleSigTerm = () => this.emit(new Shutdown(128 + 15, 'SIGTERM'));
  handleBeforeExit = () => this.emit(new Shutdown(0, 'Program ran to completion'));
  handleUncaughtException = () => this.emit(new Shutdown(1, 'Uncaught exception'));
  handleUnhandledRejection = () => this.emit(new Shutdown(1, 'Unhandled rejection'));
}
