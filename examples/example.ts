import { Container, Definition } from '../src/container';
import { bind, lookup, on, value } from '../src/facade';

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
      on(Baz).do(Box, 'process'),
      on(Baz).do(MyModule, 'handleBaz'),
      on(Baz).do(this.handleBaz),
      on(Baz).do((b) => console.log('Arrow function processing...', b)),
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
const f = c.get(Foo);
console.log(f);
console.log(f.getBar());
c.emit(new Baz('yas'));
console.log(c.get(Foo));
console.log(c.get(Foo99));
