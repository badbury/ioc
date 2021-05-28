import * as NodeJSHttp from 'http';
import { http, HttpModule, StartHttpServer } from '../../http-server/src/module';
import { every, TimerModule } from '../../timers/src/module';
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
//   - Adapters
//     - http routing http(GetFoo).do(X, 'foo') DONE
//     - cli routing command(ServeHttp).do(X, 'foo')
//     - timers every(5, 'minutes').use(Y).do(X, 'foo') DONE
//   - Composers
//     - interceptors bind(X).intercept('foo', Y, Z)
//     - decorators bind(X).decorate(Y, Z)
//     - pipeline bind(X).pipeline().pipe(Y, 'foo').pipe(Z, 'bar') (use Proxy)
//     - factories bind(X).use(Foo).factory((foo) => foo.getX()) DONE
//       - still need to handle methods: factory(Foo, 'getX')
//     - dispatchers on(X).dispatchWith(Y, 'foo') DONE
//     - use extra args on(Foo).use(Y).do(X, 'foo') DONE
//     - emit on(X).do(Y, 'foo').emit() DONE
//     - fallback bind(X).fallback(value(console.log.bind(console)))
// - Bind = di | On = events | Http = http | Cli = command | Timer = every
// - Throw on missing definition
// - Detect missing dependencies in a module defnition type
//   - only allow a complete module to be passed to containers
// - Types of callable
//   - do((arg) => arg + 1)
//   - do(Y, 'foo')
//   - do(MyFunction)
//     - interface MyFunction { (name: string, age: number): unknown }
//     - abstract class MyFunction {}
//     - const myFunction = (name, age, printer) => printer.print(name, age)
//     - bind(MyFunction).to(myFunction).partial(2, Printer)

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
  constructor(public one = Math.random()) {}
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

abstract class Foo66 extends Foo {}
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

abstract class ConfigUrl extends String {}

// type ExampleFnType = (tig: Tig) => void;
interface TigHandler {
  (tig: Tig): void;
}
abstract class TigHandler {}
interface SendHttpRequest {
  (url: string | URL): Promise<NodeJSHttp.IncomingMessage>;
}
abstract class SendHttpRequest {}

export class MyModule {
  register(): Definition[] {
    return [
      bind(MyConfig),
      bind(Bar),
      bind(MyModule),
      bind(ConfigUrl)
        .use(MyConfig)
        .factory((config) => config.url),
      bind(Foo66).to(Foo).with(Bar, ConfigUrl, value(66)),
      bind(Foo99)
        .to(Foo)
        .with(
          Bar,
          lookup(MyConfig).map((config) => config.url),
          value(99),
        ),
      bind(Foo77).factory(() => new Foo(new Bar(0.7), 'Nooo', 77)),
      bind(Foo88)
        .use(Bar, MyConfig)
        .factory((bar, config) => new Foo(bar, config.url, 88)),
      bind(Foo).with(Bar, lookup(MyConfig).map(this.getUrl), value(1)),
      bind(Box),
      bind(Trigger).with(DynamicEventSink as any, DynamicEventSink),
      bind(TigHandler).value((tig) => console.log('MY TIG HAS TOG', tig.makeTog())),
      bind(SendHttpRequest).value(
        (url) =>
          new Promise((resolve) => {
            const req = NodeJSHttp.request(url, (res) => {
              res.on('data', (d) => {
                resolve(d.toString('utf8'));
              });
            });
            req.end();
          }),
      ),
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
        .emit(),
      on(Tog).do((tog) => console.log('I got the tog!', tog)),
      on(Tig).do(TigHandler),
      bind(GetCompanies),
      bind(GetCompaniesHttpRoute),
      http(GetCompaniesHttpRoute)
        .use(GetCompanies)
        .do((req, getCompanies) => getCompanies.handle(req)),
      bind(GetUsers),
      bind(GetUsersHttpRoute),
      http(GetUsersHttpRoute).do(GetUsers, 'handle'),
      on(Shutdown).do(async (shutdown) => {
        console.log('Prepping shutdown', shutdown);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('Finishing shutdown');
        return 'Foooo';
      }),
      every('second')
        .and(100, 'milliseconds')
        .limit(5)
        .use(SendHttpRequest)
        .do(async (sendHttpRequest) => {
          console.log(await sendHttpRequest('http://localhost:8080/users?limit=1'));
          console.log(await sendHttpRequest('http://localhost:8080/companies?limit=1'));
        }),
      every(10, 'seconds')
        .limit(1)
        .do(() => new Shutdown(0, '10 seconds up'))
        .emit(),
    ];
  }

  getUrl(config: MyConfig): string {
    return config.url;
  }

  handleBaz(baz: Baz, foo: Foo, bar: Bar): void {
    console.log('Use statement', baz, foo, bar);
  }
}

const c = new Container([
  new MyModule(),
  new HttpModule(),
  new TimerModule(),
  new NodeJSLifecycleModule(),
]);

console.log(c.get(Bar));
const foo = c.get(Foo);
const foo99 = c.get(Foo99);
console.log(foo99);
console.log(foo);
c.emit(foo99);

c.emit(new Tig());

const tigHandler = c.get(TigHandler);
tigHandler(new Tig());

c.emit(new StartHttpServer(8080));

// interface MyFunction {
//   (name: string, age: number): unknown;
// }
// abstract class MyFunction {}
// const myFunction = (name: string, age: number) => console.log(name, age);
// bind(MyFunction).to(myFunction);
// bind(MyFunction).to(myFunction).partial(2, Printer);
// type ClassOrFunction<T> = T extends Newable<T> ? ClassLike<T> : (...args: unknown[]) => unknown;

// type TypeParams<T extends ClassLike<T>, K> = T extends new (...args: infer ClassParams) => unknown
//   ? AsConstructors<ClassParams>
//   : T extends new (...args: infer FnParams) => unknown
//   ? K extends new (...args: infer TypeParams) => unknown
//     ? AsConstructors<[...TypeParams, ...FnParams]>
//     : never
//   : never;

//// Below is post MVP of timers
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

// Vision 28th May
// class UserModule {
//   define() {
//     return [
//       config(KeycloakConnection).object({
//         url: define(),
//       }),
//       config(ConcurrencyLimit),
//       bind(GetUsers).with(KeycloakConnection),
//       bind(SlackNotify).to(Slack, 'notify'),
//       command('get-users', GetUsersCommand).do(GetUsers),
//       http('GET', '/users', GetUsersHttp).do(GetUsers),
//       every(7, 'seconds').do(FlushUsers),
//       on(UserCreated).do(SlackNotify),
//     ];
//   }
// }

// vs

// class UserModule {
//   define() {
//     return [
//       config(KeycloakConnection).object(KeycloakConnectionDefinition),
//       config(ConcurrencyLimit),
//       bind(GetUsers).with(KeycloakConnection),
//       bind(SlackNotify).to(Slack, 'notify'),
//       command(GetUsersCommand).do(GetUsers),
//       http(GetUsersHttp).do(GetUsers),
//       every(SevenSeconds).do(FlushUsers),
//       on(UserCreated).do(SlackNotify),
//     ];
//   }
// }
