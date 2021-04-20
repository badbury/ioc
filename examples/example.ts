import { Container, Definition } from '../src/Container';
import { bind, lookup, on } from '../src/facade';

class MyConfig {
  url = 'https://example.org';
}

class Bar {
  one = Math.random();
  constructor() {}
}

class Foo {
  constructor(public bar: Bar, private url: string) {}
  getBar(): Bar {
    return this.bar;
  }
}

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
      bind(Foo).with(
        Bar,
        lookup(MyConfig).map((config) => config.url),
      ),
      bind(Box),
      on(Baz).do(Box, 'process'),
      on(Baz).do((b) => console.log('Arrow function processing...', b)),
    ];
  }
}

const m = new MyModule();
const c = new Container([m]);

console.log(c.get(Bar));
const f = c.get(Foo);
console.log(f);
console.log(f.getBar());
c.emit(new Baz('yas'));
