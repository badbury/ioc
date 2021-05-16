import { http, HttpModule, StartHttpServer } from '../../http-server/src/module';
import { GetCompanies } from '../../http-server/examples/simple-use-case/get-companies';
import { GetCompaniesHttpRoute } from '../../http-server/examples/simple-use-case/get-companies-http';
import {
  Container,
  bind,
  lookup,
  on,
  value,
  DynamicEventSink,
  NodeJSLifecycleModule,
  Definition,
  Shutdown,
} from '../src';
import { GetUsers } from '../../http-server/examples/use-case-with-types/get-users';
import { GetUsersHttpRoute } from '../../http-server/examples/use-case-with-types/get-users-http';
// @TODO:
// - Implement recursive loop checks
// - Detect incomplete bindings e.g. bind(Foo) should fail if Foo requires params
// - Implement the following features:
//   - Core
//     - di bind(X).with(A, B).to(Y) DONE
//     - events on(Foo).do(X, 'foo') DONE
//     - use extra args on(Foo).use(Y).do(X, 'foo') DONE
//   - Adapters
//     - http routing http(GetFoo).do(X, 'foo') DONE
//     - cli routing command(ServeHttp).do(X, 'foo')
//     - timers every(5).minutes().use(Y).do(X, 'foo') | every('* 1 * * * *').cron().do(X, 'foo')
//   - Composers
//     - interceptors bind(X).intercept('foo', Y, Z)
//     - decorators bind(X).decorate(Y, Z)
//     - pipeline bind(X).pipeline().pipe(Y, 'foo').pipe(Z, 'bar') (use Proxy)
//     - factories bind(X).use(Foo).factory((foo) => foo.getX()) DONE
//     - dispatchers on(X).dispatchWith(Y, 'foo') DONE
//     - emit on(X).do(Y, 'foo').emitResponse() DONE
//     - fallback bind(X).fallback(vaule(console.log.bind(console)))
// - Bind = di | On = events | Http = http | Cli = command | Timer = every
// - Throw on missing definition
// - Detect missing dependencies in a module defnition type
//   - only allow a complete module to be passed to containers

// Creational patterns
// Builder	- use a factory
// Dependency Injection - bind/with
// Factory method - factoryBuilder - Given a resolvable and a method name, build a factory object
// Lazy initialization	- lazy - wrap type in proxy and only initalize when called
// Multiton - bind with extended classes
// Singleton	- bind creates a singleton

// Structural patterns
// Decorator - decorate
// Extension - ???
// Facade - ???
// Front controller - http/command/every
// Module - Module
// Proxy	- ???
// Chain of responsibility	- pipeline & pipe bind(X).pipe(Y, 'method').pipe(Z, 'other')
// Command - on/use/do
// Observer - on/do

class MyConfig {
  url = 'https://example.org';
}

class Bar {
  one = Math.random();
}

class Foo {
  constructor(public bar: Bar, private url: string, private id: number) {}
  getBar(): Bar {
    return this.bar;
  }
  makeBaz(): Baz {
    return new Baz(this.url);
  }
}

abstract class Foo77 extends Foo {}
abstract class Foo88 extends Foo {}
abstract class Foo99 extends Foo {}

class Baz {
  constructor(public name: string) {}
}

class Box {
  badMethod(str: string) {
    console.log(str);
  }
  process(baz: Baz) {
    console.log('Box class processing........', baz);
  }
}

type TriggerEvents = Bar | Baz;
interface TriggerEventClassEmitter {
  dispatchThing(event: TriggerEvents): void;
}
type TriggerEventFunctionEmitter = (event: TriggerEvents) => void;

class Trigger {
  constructor(
    private emitter: TriggerEventClassEmitter,
    private emit: TriggerEventFunctionEmitter,
  ) {}

  trigger(foo: Foo) {
    this.emitter.dispatchThing(foo.getBar());
    this.emit(foo.makeBaz());
  }
}

class Tig {
  makeTog() {
    return new Tog();
  }
}
class Tog {}

export class MyModule {
  register(): Definition[] {
    return [
      bind(MyConfig),
      bind(Bar),
      bind(MyModule),
      bind(Foo99)
        .to(Foo)
        .with(
          Bar,
          lookup(MyConfig).map((config) => config.url),
          value(99),
        ),
      bind(Foo77).factory(() => new Foo(new Bar(), 'Nooo', 77)),
      bind(Foo88)
        .use(Bar, MyConfig)
        .factory((bar, config) => new Foo(bar, config.url, 88)),
      bind(Foo).with(Bar, lookup(MyConfig).map(this.getUrl), value(1)),
      bind(Box),
      bind(Trigger).with(DynamicEventSink as any, DynamicEventSink),
      on(Foo).do(Trigger, 'trigger'),
      on(Bar).do((bar) => console.log('Arrow Bar...', bar)),
      on(Baz).do(Box, 'process'),
      on(Baz).use(Foo, Bar).do(MyModule, 'handleBaz'),
      on(Baz).use(Foo88, Bar).do(this.handleBaz),
      on(Baz)
        .use(Foo88)
        .do((baz, foo) => console.log('Arrow Baz...', baz, foo.getBar())),
      on(Tig)
        .do((tig) => tig.makeTog())
        .emitResponse(),
      on(Tog).do((tog) => console.log('I got the tog!', tog)),
      bind(GetCompanies),
      bind(GetCompaniesHttpRoute),
      http(GetCompaniesHttpRoute).do(GetCompanies, 'handle'),
      bind(GetUsers),
      bind(GetUsersHttpRoute),
      http(GetUsersHttpRoute).do(GetUsers, 'handle'),
      on(Shutdown).do(async (shutdown) => {
        console.log('Prepping shutdown', shutdown);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('Finishing shutdown');
        return 'Foooo';
      }),
      // every('minute')
      //   .do(() => new Shutdown(0, '1 minute up'))
      //   .emitResponse(),
      // http(GetCompaniesHttpRoute).do((req) => {
      //   console.log(req);
      //   return [{ name: 'Steve' }];
      // }),
    ];
  }

  getUrl(config: MyConfig): string {
    return config.url;
  }

  handleBaz(baz: Baz, foo: Foo, bar: Bar): void {
    console.log('Use statement', baz, foo, bar);
  }
}

const c = new Container([new MyModule(), new HttpModule(), new NodeJSLifecycleModule()]);

console.log(c.get(Bar));
const foo = c.get(Foo);
const foo99 = c.get(Foo99);
console.log(foo99);
console.log(foo);
c.emit(foo99);
c.emit(new Tig());
c.get(Tig);

c.emit(new StartHttpServer(8080));
// c.emit(new Shutdown(1, 'Because its time'));

// interface ChainableDuration {
//   and: DurationFunction;
// }

// interface DurationFunction {
//   (unit: 'minute'): ChainableDuration;
//   (duration: number, unit: 'minutes'): ChainableDuration;
//   (unit: 'second'): ChainableDuration;
//   (duration: number, unit: 'seconds'): ChainableDuration;
//   (unit: 'millisecond'): ChainableDuration;
//   (duration: number, unit: 'milliseconds'): ChainableDuration;
//   (unit: 'hour'): ChainableDuration;
//   (duration: number, unit: 'hours'): ChainableDuration;
//   (unit: 'day'): ChainableDuration;
//   (duration: number, unit: 'days'): ChainableDuration;
//   (unit: 'month'): ChainableDuration;
//   (duration: number, unit: 'months'): ChainableDuration;
// }

// type Every = DurationFunction;

// const every: Every = function (...args: any[]): any {};

// every('day').and(5, 'minutes');

//// Below is post MVP
// type OneToTen = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
// type ElevenToTwenty = 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;
// type TwentyOneToThirty = 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30;
// type ThirtyOneToForty = 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40;
// type FortyOneToFifty = 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50;
// type FiftyOneToThirty = 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60;
// type DayOfMonth = OneToTen | ElevenToTwenty | TwentyOneToThirty | 31;
// type HourOfDay = OneToTen | 11 | 12;
// type MinuteInHour =
//   | OneToTen
//   | ElevenToTwenty
//   | TwentyOneToThirty
//   | ThirtyOneToForty
//   | FortyOneToFifty
//   | FiftyOneToThirty;

// interface TimePointFunction {
//   (duration: DayOfMonth, type: 'day of the month'): ChainableDuration;
//   (duration: HourOfDay, type: 'AM' | 'PM'): ChainableDuration;
//   (duration: MinuteInHour, type: 'past the hour'): ChainableDuration;
// }

// every('month').at(17, 'day of the month');
// every('day').at(3, 'AM');
// every('hour').at(23, 'past the hour');
// every('month').at(17, 'day of the month').at(3, 'AM').at(23, 'past the hour');
