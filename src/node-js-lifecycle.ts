import { Definition, Shutdown, Startup } from './container';
import { bind } from './dependency-injection';
import { DynamicEventSink, on } from './events';
import { ListnerFunctions } from './events-dispatchers';

export class NodeJSLifecycleModule {
  register(): Definition[] {
    return [
      bind(NodeJSLifecycleModule),
      bind(NodeSignalHandlers).with(DynamicEventSink),
      on(Shutdown).dispatchWith(NodeJSLifecycleModule, 'shutdownDispatcher'),
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
    if (shutdown.exitCode !== false) {
      process.exit(shutdown.exitCode);
    }
  }
}

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
  handleUncaughtException = (err: Error) => this.emit(new Shutdown(1, 'Uncaught exception', err));
  handleUnhandledRejection = (err: Error) => this.emit(new Shutdown(1, 'Unhandled rejection', err));
}
