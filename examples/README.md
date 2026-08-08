# asyncraft examples

## 1) HTTP API retry + timeout

```ts
import { retry, withTimeout } from 'asyncraft';

const payload = await retry(
  () =>
    withTimeout(
      (signal) =>
        fetch('https://httpbin.org/delay/1', {
          signal,
        }).then((r) => r.json()),
      2000,
    ),
  {
    retries: 3,
    minDelay: 100,
    maxDelay: 1000,
    shouldRetry: (error) => !(error instanceof TypeError),
  },
);
```

## 2) Bounded-concurrency queue

```ts
import { asyncMap, sleep } from 'asyncraft';

const results = await asyncMap(
  new Array(100).fill(0),
  async (_item, i) => {
    await sleep(50);
    return i * i;
  },
  { concurrency: 4 },
);
```

`asyncMap` limits concurrent work; it does not enforce a requests-per-second rate. Use a separate scheduler when a downstream service requires a time-based rate limit.

## 3) Graceful fallback with settled mode

```ts
import { asyncMap, TimeoutError } from 'asyncraft';

const results = await asyncMap(
  ['a', 'b', 'c'],
  async (id) => {
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => `ok-${id}`),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new TimeoutError('timeout')), 10),
        ),
      ]);
      return value;
    } catch {
      throw new Error(`failed-${id}`);
    }
  },
  { settled: true, concurrency: 3 },
);
```
