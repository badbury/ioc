import { Container, Definition, bind, lookup, on, value, EventSink } from '../src';

// @TODO:
// - Implement recursive loop checks
// - Pass multiple resolvers to listeners on(Bar).with(Foo, Qux).do(Box, 'process')
// - Detect incomplete bindings e.g. bind(Foo) should fail if Foo requires params

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
      on(Bar).do((bar) => console.log('Handling Bar...', bar)),
      on(Baz).do(Box, 'process'),
      on(Baz).do(MyModule, 'handleBaz'),
      on(Baz).do(this.handleBaz),
      on(Baz).do((baz) => console.log('Arrow function processing...', baz)),
    ];
  }

  getUrl(config: MyConfig): string {
    return config.url;
  }

  handleBaz(baz: Baz): void {
    console.log(baz);
  }
}

const m = new MyModule();
const c = new Container([m]);

console.log(c.get(Bar));
const foo = c.get(Foo);
const foo99 = c.get(Foo99);
console.log(foo);
console.log(foo99);
console.log(foo.getBar());
c.emit(new Baz('yas'));
c.emit(foo99);
