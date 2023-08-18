import { Definition, EmitEvent } from "./contracts.ts";
import { bind } from "./injector.ts";
import { ListnerFunctions, on } from "./events.ts";
import { Exit, Shutdown, Startup } from "./lifecycle.ts";

// @TODO consider for split into a separate package

export class NodeJSLifecycleModule {
  register(): Definition[] {
    return [
      bind(NodeJsHandlers).with(EmitEvent),
      on(Exit).dispatchWith(NodeJsHandlers, "exit"),
      on(Startup).do(NodeJsHandlers, "bind"),
      on(Shutdown).do(NodeJsHandlers, "unbind"),
    ];
  }
}

class NodeJsHandlers {
  constructor(private emit: EmitEvent) {}

  async exit(
    exit: Exit,
    listeners: ListnerFunctions<typeof Exit>,
  ): Promise<void> {
    await Promise.all(listeners.map((listener) => listener(exit)));
    if (exit.shutdown.exitCode !== false) {
      Deno.exit(exit.shutdown.exitCode);
    }
  }

  bind() {
    Deno.addSignalListener("SIGHUP", this.handleSigHup);
    Deno.addSignalListener("SIGINT", this.handleSigInt);
    Deno.addSignalListener("SIGTERM", this.handleSigTerm);
    globalThis.addEventListener("unload", this.handleBeforeExit);
    globalThis.addEventListener("error", this.handleError);
    globalThis.addEventListener(
      "unhandledrejection",
      this.handleReject,
    );
  }

  unbind() {
    Deno.removeSignalListener("SIGHUP", this.handleSigHup);
    Deno.removeSignalListener("SIGINT", this.handleSigInt);
    Deno.removeSignalListener("SIGTERM", this.handleSigTerm);
    globalThis.removeEventListener("beforeunload", this.handleBeforeExit);
    globalThis.removeEventListener(
      "error",
      this.handleError,
    );
    globalThis.removeEventListener(
      "unhandledrejection",
      this.handleReject,
    );
  }

  handleSigHup = () => this.emit(new Shutdown("POSIX Signal SIGHUP", 128 + 1));
  handleSigInt = () => this.emit(new Shutdown("POSIX Signal SIGINT", 128 + 2));
  handleSigTerm = () =>
    this.emit(new Shutdown("POSIX Signal SIGTERM", 128 + 15));
  handleBeforeExit = () => {
    this.emit(new Shutdown("Program successfully ran to completion", 0));
  };
  handleError = (error: ErrorEvent) => {
    this.emit(new Shutdown("Uncaught error", 1, error.error));
  };
  handleReject = (error: PromiseRejectionEvent) => {
    this.emit(new Shutdown("Unhandled rejection", 1, error.reason));
  };
}
