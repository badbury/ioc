import { http, HttpModule, StartHttpServer } from '../../http-server/src/module';
import { GetCompanies } from '../../http-server/examples/simple-use-case/get-companies';
import { GetCompaniesHttpRoute } from '../../http-server/examples/simple-use-case/get-companies-http';
import { Container, bind, lookup, on, value, EventSink, Definition } from '../src';

// @TODO:
// - Implement recursive loop checks
// - Pass multiple resolvers to listeners on(Bar).with(Foo, Qux).do(Box, 'process')
// - Detect incomplete bindings e.g. bind(Foo) should fail if Foo requires params
// - Implement the following features:
//   - di bind(X).with(A, B).to(Y) DONE
//   - events on(Foo).do(X, 'foo') DONE
//   - http routing http(GetFoo).do(X, 'foo')
//   - cli routing command(ServeHttp).do(X, 'foo')
//   - interceptors bind(X).intercept('foo', Y, Z)
//   - decorators bind(X).decorate(Y, Z)
//   - factories bind(X).factory(Foo, (foo) => foo.getX())
//   - use extra args on(Foo).use(Y).do(X, 'foo') DONE
//   - Bind = di | On = events | Http = http | Cli = cli
// - Throw on missing definition
// - Detect missing dependencies in a module defnition type
//   - only allow a complete module to be passed to containers

class MyConfig {
  url = 'https://example.org';
}

class Bar {
  one = Math.random();
  constructor(public two: string) {}
}

class Foo {
  constructor(public bar: Bar, private url: string, private id: number) {}
  getBar(): Bar {
    return this.bar;
  }
}

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

class Trigger {
  constructor(private event: EventSink) {}
  trigger(foo: Foo) {
    this.event.emit(foo.getBar());
  }
}

export class MyModule {
  register(): Definition[] {
    return [
      bind(MyConfig),
      bind(Bar),
      bind(MyModule),
      bind(Foo)
        .with(
          Bar,
          lookup(MyConfig).map((config) => config.url),
          value(99),
        )
        .to(Foo99),
      bind(Foo).with(Bar, lookup(MyConfig).map(this.getUrl), value(1)),
      bind(Box),
      bind(Trigger).with(EventSink),
      on(Foo).do(Trigger, 'trigger'),
      on(Bar).do((bar) => console.log('Arrow Bar...', bar)),
      on(Baz).do(Box, 'process'),
      on(Baz).use(Foo, Bar).do(MyModule, 'handleBaz'),
      on(Baz).use(Foo99, Bar).do(this.handleBaz),
      on(Baz)
        .use(Foo99)
        .do((baz, foo) => console.log('Arrow Baz...', baz, foo.getBar())),
      bind(GetCompanies),
      bind(GetCompaniesHttpRoute),
      http(GetCompaniesHttpRoute), //.do(GetCompanies, 'handle'),
    ];
  }

  getUrl(config: MyConfig): string {
    return config.url;
  }

  handleBaz(baz: Baz, foo: Foo, bar: Bar): void {
    console.log('Use statement', baz, foo, bar);
  }
}

const m = new MyModule();
const c = new Container([m, new HttpModule()]);

console.log(c.get(Bar));
const foo = c.get(Foo);
const foo99 = c.get(Foo99);
console.log(foo);
console.log(foo99);
console.log(foo.getBar());
c.emit(new Baz('yas'));
c.emit(foo99);

c.emit(new StartHttpServer(8080));
