# Badbury IoC

The Badbury Inversion of Control system provides:

- Dependency Injection
- Component Composition
- Event Routing

## Philosophy and Motivation

Many alternatives exist in the DI and event routing space but Badbury IoC is
unique in it's pursuit for:
1. Full type safety - no more execessive checks, have confident in your types.
2. Non-intrusive - no more littering dependencies throughout your domain logic

Other DI solutions require or recommend using annotations on your core code,
sneakly making your entire application depend on it. They also allow using
symbols and strings as keys


## Example

### Step 1: Write your business logic

```typescript
class Calculator {
  add(a: number, b: number) { return a + b; }
}

abstract class Car {
  abstract speedUp(speed: number): void;
}

class Honda implements Car {
  constructor(private speed: number = 0, private calculator: Calculator) {}
  speedUp(speed: number): void {
    this.speed = this.calculator.add(this.speed, this.speed);
    console.log(`Speeding up to ${this.speed}mph`);
  }
}

class Accelerate { constructor(public speed: number) {} }
```

### Step 2: Wire it up in an IoC module
```typescript
import { bind, on, value, Definition } from '@badbury/ioc';

export class CarModule {
  register(): Definition[] {
    return [
    
      // Bind abstract classes to concrete classes
      bind(Car).to(Honda).with(value(50), Calculator),
      
      // Compose and decorate classes with extra behaviour
      bind(Calculator).teeIntercept('add', (a, b, next) => {
        console.log(`${a} + ${b} = ${next()}`);
      }),
      
      // Route events to handles, using values defined in the container
      on(Accelerate)
        .use(Car)
        .do((accelerate, car) => car.speedUp(accelerate.speed)),
        
    ];
  }
}
```

### Step 3: Build the container and use it
```typescript
import { Container } from '@badbury/ioc';

const container = new Container([
  new CarModule(),
]);

container.get(Calculator).add(1, 2);
// stdout $ 1 + 2 = 3

container.emit(new Accelerate(20));
// stdout $ 50 + 20 = 70
// stdout $ Speeding up to 70mph
```

And everything is typesafe! No anys or unknowns here.

## Installation

```shell
npm install @badbury/ioc
```

## Documentation

This library is so intuitive it needs no documentation /s.

Documentation still todo.
