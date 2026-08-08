# asyncraft

[![npm version](https://img.shields.io/npm/v/asyncraft?logo=npm)](https://www.npmjs.com/package/asyncraft)
[![CI](https://github.com/torisKR/asyncraft/actions/workflows/ci.yml/badge.svg)](https://github.com/torisKR/asyncraft/actions/workflows/ci.yml)
[![npm downloads](https://img.shields.io/npm/dm/asyncraft)](https://www.npmjs.com/package/asyncraft)
[![Node.js](https://img.shields.io/node/v/asyncraft)](https://nodejs.org)
[![bundle size](https://img.shields.io/bundlephobia/minzip/asyncraft)](https://bundlephobia.com/package/asyncraft)
[![types](https://img.shields.io/npm/types/asyncraft)](https://www.npmjs.com/package/asyncraft)
[![license](https://img.shields.io/npm/l/asyncraft)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/torisKR/asyncraft?style=social)](https://github.com/torisKR/asyncraft/stargazers)
[![issues](https://img.shields.io/github/issues/torisKR/asyncraft)](https://github.com/torisKR/asyncraft/issues)

> Zero-dependency async control-flow utilities: retry, timeout, circuit breaker, concurrency limit, async map, single-flight memoize, debounce, deferred, and AbortSignal helpers — fully typed, `AbortSignal`-aware.

Instead of installing `p-retry` + `p-timeout` + `p-limit` + `p-map` + `p-memoize` + a circuit-breaker lib separately, get the resilience and concurrency primitives every project eventually needs in one tiny, tree-shakeable package.

- **Zero dependencies** — nothing else lands in your `node_modules`.
- **TypeScript-first** — strict types, no `any`, full inference.
- **`AbortSignal` everywhere** — every wait is cancellable.
- **Composable** — stack `circuitBreaker` → `retry` → `withTimeout` inside `asyncMap`.
- **AI-friendly** — full TSDoc in IntelliSense + a machine-readable [`llms.txt`](./llms.txt) so coding agents pick the right primitive.
- **ESM + CJS** — works in modern and legacy setups, Node ≥ 18.

## Which primitive do I need?

| Problem                                                  | Use              |
| -------------------------------------------------------- | ---------------- |
| Fails intermittently — retry with backoff                | `retry`          |
| Might hang — enforce a time budget                       | `withTimeout`    |
| Dependency is down — fail fast, stop hammering it        | `circuitBreaker` |
| Too much parallelism — cap it                            | `createLimit`    |
| Run over a list with bounded parallelism, keep order     | `asyncMap`       |
| Same call fired repeatedly/concurrently — dedupe + cache | `memoize`        |
| Collapse rapid triggers into one trailing call           | `debounceAsync`  |
| A promise you resolve from elsewhere                     | `deferred`       |
| Merge several cancellation sources                       | `anySignal`      |
| Just wait, cancellably                                   | `sleep`          |

## Install

```sh
npm install asyncraft
yarn add asyncraft
pnpm add asyncraft
bun add asyncraft
```

## Usage

### `retry(fn, options?)`

Call a function until it succeeds, with exponential backoff and jitter.

```ts
import { retry } from 'asyncraft';

const user = await retry(() => fetchUser(id), {
  retries: 5, // extra attempts after the first (default 3)
  minDelay: 100, // ms before first retry (default 100)
  maxDelay: 10_000, // cap for any single delay (default 10s)
  factor: 2, // exponential growth (default 2)
  jitter: true, // randomize delays to avoid thundering herds (default true)
  shouldRetry: (err) => err instanceof HttpError && err.status >= 500,
  onRetry: (err, attempt, delay) => console.warn(`attempt ${attempt} failed, waiting ${delay}ms`),
});
```

When every attempt fails, a `RetryError` is thrown with the last error as `.cause` and the attempt count as `.attempts`. Pass a `signal` to abort retrying (including mid-delay).

### `withTimeout(promiseOrFn, ms, options?)`

Reject with `TimeoutError` if something takes too long. Pass a function to receive an `AbortSignal` that fires on timeout, so the underlying work is actually cancelled:

```ts
import { withTimeout, TimeoutError } from 'asyncraft';

// simple: race a promise against the clock
const data = await withTimeout(loadData(), 5000);

// better: cancel the underlying work too
const res = await withTimeout((signal) => fetch(url, { signal }), 5000);
```

### `createLimit(concurrency)`

A minimal `p-limit`: run at most N promises at once.

```ts
import { createLimit } from 'asyncraft';

const limit = createLimit(4);
const pages = await Promise.all(urls.map((url) => limit(() => fetch(url))));

limit.activeCount; // running now
limit.pendingCount; // waiting in queue
limit.clearQueue(); // drop everything not yet started
```

### `asyncMap(items, mapper, options?)`

Map over an iterable with bounded concurrency. Results always come back in input order.

```ts
import { asyncMap } from 'asyncraft';

const pages = await asyncMap(urls, (url) => fetch(url), { concurrency: 4 });

// don't fail fast — collect errors per item, like Promise.allSettled
const results = await asyncMap(urls, (url) => fetch(url), { concurrency: 4, settled: true });
for (const r of results) {
  if (r.status === 'fulfilled') use(r.value);
  else report(r.reason);
}
```

### `circuitBreaker(fn, options?)`

Fail fast while a dependency is down. After `failureThreshold` consecutive failures the circuit **opens** and calls reject immediately with `CircuitOpenError` (without calling `fn`); after `resetTimeout` a single trial call is allowed, and success closes it again.

```ts
import { circuitBreaker, CircuitOpenError } from 'asyncraft';

const call = circuitBreaker((id: string) => api.fetchUser(id), {
  failureThreshold: 3,
  resetTimeout: 10_000,
  shouldTrip: (err) => !(err instanceof HttpError && err.status < 500), // ignore 4xx
});

try {
  const user = await call('123');
} catch (err) {
  if (err instanceof CircuitOpenError) return cachedUser; // fast fallback
  throw err;
}

call.state; // 'closed' | 'open' | 'half-open'
call.reset(); // force back to closed
```

### `memoize(fn, options?)`

De-duplicate and cache async calls. Concurrent identical calls share **one** in-flight promise (single-flight); resolved values are cached until `ttl`. Turns a thundering herd of identical requests into one call.

```ts
import { memoize } from 'asyncraft';

const getUser = memoize((id: string) => api.fetchUser(id), { ttl: 60_000 });

// 10 concurrent getUser('42') → one fetch, one shared result
const [a, b] = await Promise.all([getUser('42'), getUser('42')]);

getUser.delete('42'); // evict one key
getUser.clear(); // evict everything
```

Options: `ttl` (default `Infinity`), `key` (default `JSON.stringify(args)`), `cacheRejections` (default `false`), `maxSize` (LRU cap, default `Infinity`).

### `debounceAsync(fn, { wait })`

Trailing-edge debounce: rapid calls collapse into a single invocation `wait` ms after the last call, using the latest args. Every caller in the window receives that invocation's result.

```ts
import { debounceAsync } from 'asyncraft';

const save = debounceAsync((doc: Doc) => api.save(doc), { wait: 500 });
editor.on('change', (doc) => save(doc)); // one save 500ms after typing stops

save.cancel(); // reject anything pending
save.pending; // is a call scheduled?
```

### `deferred()`

A promise you resolve or reject from the outside — no hand-rolled executor.

```ts
import { deferred } from 'asyncraft';

const ready = deferred<void>();
server.once('listening', () => ready.resolve());
server.once('error', (err) => ready.reject(err));
await ready.promise;
```

### `sleep(ms, options?)`

A cancellable delay.

```ts
import { sleep } from 'asyncraft';

await sleep(1000);
await sleep(60_000, { signal: controller.signal }); // rejects on abort
```

### `anySignal(...signals)` & `timeoutSignal(ms)`

Compose cancellation. `timeoutSignal` makes a signal that self-aborts after `ms`; `anySignal` merges several signals into one that aborts when the first does (a drop-in for `AbortSignal.any` on Node < 20).

```ts
import { anySignal, timeoutSignal } from 'asyncraft';

// abort when the caller cancels OR a 5s deadline passes
const signal = anySignal(req.signal, timeoutSignal(5000));
await fetch(url, { signal });
```

### Composing

The pieces are designed to combine:

```ts
import { asyncMap, retry, withTimeout } from 'asyncraft';

const results = await asyncMap(
  urls,
  (url) =>
    retry(() => withTimeout((signal) => fetch(url, { signal }), 5000), {
      retries: 3,
    }),
  { concurrency: 8, settled: true },
);
```

## Real-world examples

### 1) Cancellable fanout calls with retries

```ts
import { asyncMap, retry, withTimeout } from 'asyncraft';

const pages = await asyncMap(
  Array.from({ length: 30 }, (_, index) => `https://api.example.com/item/${index}`),
  (url) =>
    retry(() => withTimeout((signal) => fetch(url, { signal }).then((res) => res.json()), 4000), {
      retries: 3,
      minDelay: 150,
    }),
  { concurrency: 8, settled: true },
);
```

### 2) Burst-safe upload queue

```ts
import { createLimit, sleep } from 'asyncraft';

const limit = createLimit(4);
const files = [...Array(50).keys()];

await Promise.all(
  files.map((id) =>
    limit(async () => {
      await upload(`/tmp/${id}.bin`);
      await sleep(10);
    }),
  ),
);
```

### 3) Fast timeout guard for long jobs

```ts
import { withTimeout, TimeoutError } from 'asyncraft';

try {
  await withTimeout(runLongTask(), 10_000);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('task timed out');
  }
}
```

## API summary

| Export                      | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `retry(fn, opts?)`          | Exponential-backoff retry with jitter            |
| `withTimeout(p, ms, o?)`    | Time-bound a promise, cancel underlying work     |
| `circuitBreaker(fn, opts?)` | Fail fast while a dependency is down             |
| `createLimit(n)`            | Concurrency limiter (`p-limit` style)            |
| `asyncMap(items, fn, o?)`   | Ordered async map with bounded concurrency       |
| `memoize(fn, opts?)`        | Single-flight de-dup + TTL cache for async calls |
| `debounceAsync(fn, {wait})` | Trailing-edge async debounce                     |
| `deferred()`                | Externally-resolvable promise                    |
| `sleep(ms, opts?)`          | Cancellable delay                                |
| `anySignal(...signals)`     | Merge `AbortSignal`s into one                    |
| `timeoutSignal(ms)`         | An `AbortSignal` that self-aborts after `ms`     |
| `TimeoutError`              | Thrown by `withTimeout`                          |
| `RetryError`                | Thrown by `retry` when attempts are exhausted    |
| `CircuitOpenError`          | Thrown by an open `circuitBreaker`               |

## Development

```sh
npm install
npm run tdd           # TDD loop: vitest watch mode + live coverage
npm run test:coverage # same, plus the coverage gate CI enforces
npm run lint          # eslint (type-checked)
npm run typecheck     # tsc --noEmit
npm run build         # tsup → dist/ (ESM + CJS + d.ts)
```

See [TESTING.md](./TESTING.md) for the TDD workflow and the test-harness
layers (unit / stability / property-based / type tests).

`npm run ci` runs lint, typecheck, coverage, and build in one command.

## For AI coding agents

asyncraft is built to be consumed correctly by LLM-based tools:

- A machine-readable [`llms.txt`](./llms.txt) ships in the published package — a concise map of every export with signatures, a "which primitive for which problem" guide, conventions, and copy-paste recipes, so an agent can pick the right primitive without reading source.
- Every public symbol carries full TSDoc (`@param` / `@throws` / `@remarks` / `@example`), so the same guidance appears in editor IntelliSense and in any tool that reads `.d.ts`.
- Strong, inference-friendly types (verified by type-level tests) mean generated call sites either type-check or fail loudly.

## Stability guarantees

These behaviors are pinned by a dedicated test suite (unit + stress +
property-based + type-level; see [TESTING.md](./TESTING.md)) — a change that
breaks any of them fails CI and cannot be published:

- **No timer or listener leaks.** Every `setTimeout` is cleared and every
  `AbortSignal` listener removed once an operation settles or is aborted. A
  long-lived signal can be reused across thousands of calls, and a cancelled
  delay never keeps the process alive.
- **Abort reasons are always throwable.** If `signal.reason` is an `Error` it
  is rethrown as-is; strings and other primitives are wrapped in an `Error`
  named `AbortError` with a readable message.
- **Deterministic retry accounting.** `retry` calls your function exactly
  `retries + 1` times in the worst case. Without jitter, delays follow
  `min(minDelay · factor^(n-1), maxDelay)` and never decrease; with jitter
  each delay stays within `[50%, 100%]` of that value.
- **Order preservation.** `asyncMap` results always match input order, for any
  input and any concurrency (verified with property-based tests).
- **Failure isolation.** A rejecting task frees its `createLimit` slot like
  any other, and `asyncMap`'s `settled` mode reports every item — one failure
  never stalls the queue or hides another result.
- **Typed error surface.** Timeouts throw `TimeoutError`, exhausted retries
  throw `RetryError` (with `.cause` and `.attempts`) — both `instanceof`-able.

All public APIs carry full TSDoc (`@param`, `@throws`, `@remarks`,
`@example`), so the same documentation appears in your editor's IntelliSense.

## Contributing

1. Fork this repository
2. Create a feature branch (`feat/your-topic`)
3. Run checks before PR:

```sh
npm run lint
npm run typecheck
npm run test
```

PRs with behavior changes should also include focused tests.

## Discussions and support channels

- Ask questions and architectural questions in GitHub Discussions:
  - `https://github.com/torisKR/asyncraft/discussions`
- Open bug reports with the bug issue template:
  - `https://github.com/torisKR/asyncraft/issues/new?template=bug_report.md`
- Open feature proposals in the issue template:
  - `https://github.com/torisKR/asyncraft/issues/new?template=feature_request.md`

## Community and governance

- [Contributing guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Support policies](./SUPPORT.md)
- [Maintainers](./MAINTAINERS.md)
- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)
- [FAQ](./docs/faq.md)
- [Examples](./examples/README.md)
- [Release process](./RELEASING.md)

## Security

If you think you found a security issue, follow [`SECURITY.md`](./SECURITY.md).

## License

MIT license. See [LICENSE](./LICENSE).
