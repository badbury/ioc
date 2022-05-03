import { Definition, DynamicEventSink } from './contracts';
import { bind } from './injector';
import { on } from './events';
import { Startup, Shutdown, Exit } from './lifecycle';
import { ListnerFunctions } from '.';

// @TODO consider for split into a separate package

export class NodeJSLifecycleModule {
  register(): Definition[] {
    return [
      bind(NodeJsHandlers).with(DynamicEventSink),
      on(Exit).dispatchWith(NodeJsHandlers, 'exit'),
      on(Startup).do(NodeJsHandlers, 'bind'),
      on(Shutdown).do(NodeJsHandlers, 'unbind'),
    ];
  }
}

class NodeJsHandlers {
  constructor(private emit: DynamicEventSink) {}

  async exit(exit: Exit, listeners: ListnerFunctions<typeof Exit>): Promise<void> {
    await Promise.all(listeners.map(async (listener) => listener(exit)));
    if (exit.shutdown.exitCode !== false) {
      process.exit(exit.shutdown.exitCode);
    }
  }

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

  handleSigHup = () => this.emit(new Shutdown('SIGHUP', 128 + 1));
  handleSigInt = () => this.emit(new Shutdown('SIGINT', 128 + 2));
  handleSigTerm = () => this.emit(new Shutdown('SIGTERM', 128 + 15));
  handleBeforeExit = () => this.emit(new Shutdown('Program ran to completion', 0));
  handleUncaughtException = (err: Error) => this.emit(new Shutdown('Uncaught exception', 1, err));
  handleUnhandledRejection = (err: Error) => this.emit(new Shutdown('Unhandled rejection', 1, err));
}
