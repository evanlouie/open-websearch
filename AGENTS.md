# Developer Instructions

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open-WebSearch is a Model Context Protocol (MCP) server that provides multi-engine web search capabilities without requiring API keys. It scrapes search results from various engines (Bing, DuckDuckGo, Brave) and orchestrates configuration + runtime concerns through the [Effect](https://effect.website/) library.

**Repository:** https://github.com/evanlouie/open-websearch

## Common Development Commands

**Note:** This project uses Bun runtime and executes TypeScript directly without a compilation step.

### Build and Development

```bash
# Install dependencies
bun install

# Start the server
bun start

# Development mode
bun dev

# Run MCP inspector for testing
bun inspector

# Type checking (TypeScript strict mode)
bun run typecheck

# Run tests
bun test
```

### Testing Different Modes

```bash
# Test STDIO mode
bun test:stdio

# Test HTTP mode
bun test:http

# Test both modes
bun test:both
```

### BUNX Usage (for testing as end user)

```bash
# Basic usage
bunx open-websearch@latest

# With environment variables
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true bunx open-websearch@latest
```

## Architecture

### Transport Modes

The server supports three operational modes via the `MODE` environment variable:

- **`both`** (default): Runs both HTTP server and STDIO transport
- **`http`**: HTTP server only (SSE and StreamableHTTP endpoints)
- **`stdio`**: STDIO transport only (for direct process communication)

### Entry Point

- **`src/index.ts`**: Main server initialization (Effect program)
  - Obtains configuration via the `AppConfig` layer exposed in `src/config.ts`
  - Creates MCP server using the effectful `createMcpServer()` from `server.ts`
  - Configures STDIO transport if enabled
  - Creates HTTP server using `createHttpServer()` if enabled
  - Manages server startup based on MODE environment variable inside the Effect runtime

### Configuration System

- **`src/config.ts`**: Centralized configuration via environment variables, decoded into an Effect layer (`AppConfig`)
  - Default search engine selection
  - Allowed search engines list (restricts which engines can be used)
  - Proxy configuration for restricted regions
  - CORS settings for HTTP server
  - Server mode (HTTP, STDIO, or both)
  - Provides helper Effect utilities such as `getProxyUrl()`

Key configuration variables:

- `DEFAULT_SEARCH_ENGINE`: Default engine (bing, duckduckgo, brave)
- `ALLOWED_SEARCH_ENGINES`: Comma-separated list to restrict available engines
- `USE_PROXY`: Enable HTTP proxy
- `PROXY_URL`: Proxy server URL
- `ENABLE_CORS`: Enable CORS for HTTP server
- `MODE`: Server mode (both, http, stdio)
- `PORT`: HTTP server port (default: 3000)

### MCP Tools Registration

- **`src/tools/setupTools.ts`**: Registers all MCP tools with the server via Effect
  - `search`: Multi-engine web search supporting single or multiple queries (max 10)
  - Handles search result distribution across multiple engines using effectful concurrency helpers
  - Implements per-engine sequential, cross-engine parallel execution for multi-query searches with typed error handling

### Search Engine Architecture

Each search engine is implemented as a separate module in `src/engines/[engine-name].ts`:

- **Search function**: Scrapes search results using axios + cheerio wrapped in an Effect
- **Helper functions**: Small, composable pure functions exported for testing
- **Comprehensive unit tests**: Each engine has `[engine-name].test.ts` with extensive coverage

Search engines use web scraping to extract structured data:

- Parse HTML using cheerio
- Extract titles, URLs, descriptions from search result pages via pure helper functions
- Handle pagination when needed
- Return standardized `SearchResult` objects wrapped in `Effect`
- Surface scraper failures through `SearchEngineError`
- All parsing logic is testable and uses functional composition

### Type Definitions

- **`src/types.ts`**: Core TypeScript interfaces
  - `SearchResult`: Standard search result format with title, url, description, source, engine

### HTTP Server Architecture

HTTP server implementation is split across:

- **`src/server.ts`**: Server creation and configuration (exported for testing)
  - `createMcpServer()`: Effect that creates and configures the MCP server with tools
  - `createHttpServer()`: Effectful factory that returns an HTTP server with transport handlers
  - Helper utilities: `parseBody()`, `addCorsHeaders()` implemented via Effect
- **`src/index.ts`**: Main entry point that runs the Effect program with the config layer

When HTTP mode is enabled:

- Uses Node.js `http.createServer()` from `node:http` module
  - Fully compatible with Bun runtime (Bun implements node:http natively)
  - No Express dependency - uses native Node.js HTTP APIs
  - Better performance and smaller dependency footprint
- **StreamableHTTP transport** (`/mcp` endpoint): Modern MCP protocol with session management
- **SSE transport** (`/sse` and `/messages` endpoints): Legacy support for older MCP clients
- Session management tracks transports by session ID
- Manual CORS handling (no cors middleware needed)
- All MCP SDK transports receive native `IncomingMessage`/`ServerResponse` objects

## Adding a New Search Engine

1. Create directory: `src/engines/[engine-name]/`
2. Implement search function in `[engine-name].ts` that returns an `Effect<SearchResult[], SearchEngineError, AppConfig>`:

   ```typescript
   import { Effect } from "effect";
   import { SearchEngineError, type SearchResult } from "../types.js";
   import { type AppConfig } from "../config.js";

   export const searchExample = (
     query: string,
     limit: number,
   ): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> => {
     // Scraping logic using axios + cheerio wrapped inside Effect helpers
   };
   ```

3. Add engine to `src/tools/setupTools.ts`:
   - Add to `SUPPORTED_ENGINES` array
   - Add to `engineMap` with search function
4. Update `src/config.ts` type if needed (AppConfig['defaultSearchEngine'])
5. Update README documentation

## Testing

The project has **106 tests** with comprehensive coverage of both unit and integration scenarios.

### Test Organization

**File Naming Convention:**

- `*.test.ts` - Unit tests for pure functions (no network/IO/servers)
- `*.integration.test.ts` - Integration tests (HTTP servers, network calls, external systems)

**Test Coverage (106 tests total):**

**Unit Tests (83 tests):**

- `src/engines/bing.test.ts` - 10 tests for parseResultElement
- `src/engines/brave.test.ts` - 13 tests for parseResultElement and createRequestOptions
- `src/engines/duckduckgo.test.ts` - 39 tests for 8 helper functions (extractPreloadUrl, parseJsonData, etc.)
- `src/server.unit.test.ts` - 21 tests for server helper functions (getHeaderValue, transport lookups, etc.)

**Integration Tests (23 tests):**

- `src/server.integration.test.ts` - HTTP server endpoints, CORS, sessions, error handling
- `src/tools/setupTools.integration.test.ts` - MCP server creation, multi-query functionality

Pure functions are exported from source files for unit testing.

Run all tests with:

```bash
bun test
```

### Manual Engine Tests

Manual testing can be done by running individual engine test files in `test/`:

- `test-bing.ts`, `test-brave.ts`, `test-duckduckgo.ts`, etc.

These scripts run the engine effects via the shared config layer for ad-hoc verification.

### Development Workflow

**IMPORTANT:** After making any code changes:

1. **Always remove old/stale code** - Delete unused functions, commented-out code, deprecated implementations, and dead code paths. Keep the codebase clean and maintainable.
2. **Update README.md** - If you added, changed, or removed features/tools, update the README with examples, usage instructions, and feature descriptions.
3. Ensure all relevant documentation is updated so it stays accurate (CLAUDE.md, inline comments, etc.).
4. Run `bunx tsc --noEmit` and confirm it passes with zero errors.
5. Run `bun run typecheck` to ensure TypeScript strict mode compliance.
6. Run `bun test` to verify all tests pass.
7. Run `bunx prettier --write .` to keep formatting consistent.
8. Test the affected functionality manually if needed.

The project MUST maintain:

- ✅ Zero TypeScript errors in strict mode (`strict: true` in tsconfig.json)
- ✅ Zero `any` types in source code (use `unknown`, proper interfaces, or type guards)
- ✅ Zero TypeScript suppressions (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`)
- ✅ Zero `try/catch` blocks in source code (use Effect/Either error handling)
- ✅ All 106 tests passing (83 unit tests + 23 integration tests)
- ✅ README.md kept up-to-date with all features and usage examples

### Code Style Notes

- Favor pattern matching instead of `if/else` for business logic branches. Build matchers with `pipe(Match.value(...), Match.when(...), Match.orElse(...))` so every case flows through the same pipeline.
- Nest matches sparingly; when stepping into a nested match, open a fresh `pipe` scoped to the new value (for example `pipe(Match.value(cfg.enableCors), ...)`).
- When a match handler performs updates, return explicitly from the handler and keep mutable writes localized.

**Error Handling Rules:**

- **NEVER use `try/catch` blocks in source code** - This is strictly prohibited
- Use Effect/Either for all error handling:
  - `Effect.try({ try: ..., catch: ... })` for synchronous operations that may throw
  - `Effect.tryPromise({ try: ..., catch: ... })` for Promise-based operations
  - `Either.try({ try: ..., catch: ... })` for pure functions returning Either
  - `Effect.flatMap` to chain error-prone operations in Effect pipelines
- At Effect boundaries (e.g., MCP SDK callbacks that expect Promises):
  - Use `Effect.runPromiseExit` + `Exit.match` instead of try/catch around `Effect.runPromise`
  - Use `Cause.pretty(cause)` for error formatting in `onFailure` handlers
- JSON parsing: Use `Effect.try` or `Either.try`, never raw try/catch
- Example of proper error handling at boundaries:
  ```typescript
  const exit = await Effect.runPromiseExit(effect);
  return pipe(
    exit,
    Exit.match({
      onFailure: (cause) => handleError(Cause.pretty(cause)),
      onSuccess: (value) => handleSuccess(value),
    }),
  );
  ```

**Type Safety Guidelines:**

- Use `AxiosRequestConfig` for axios request options instead of `any`
- Use `unknown` for JSON parsing results, not `any`
- Define interfaces for external API responses (e.g., `DuckDuckGoSearchItem`)
- Use type guards when needed for narrowing types
- Model optional data with `Option` rather than `null` / `undefined`
- Represent recoverable failures with `Either` or typed Effect errors instead of throwing
- Reach for `effect/Array`, `effect/List`, and `effect/Stream` helpers before manual loops so collection logic stays effect-aware and immutable
- In error handlers: use `error instanceof Error` to narrow types when converting unknown errors to domain errors

## Important Notes

### Web Scraping Limitations

- Search engines may block requests if rate limits are exceeded
- HTML structure changes in target sites will break scrapers
- Proxy configuration may be needed in restricted regions
- This tool is for personal use only; comply with search engine ToS

### Session Management

- StreamableHTTP transport uses session IDs to maintain state
- Sessions are stored in memory (not persistent)
- Cleanup happens on transport close

### ALLOWED_SEARCH_ENGINES Behavior

- Empty list = all engines available
- Non-empty list = restricts to specified engines only
- If default engine is not in allowed list, first allowed engine becomes default

### Proxy Configuration

- Set `USE_PROXY=true` and `PROXY_URL` to enable
- Used by all search engines via axios configuration
- Helper function: `getProxyUrl()` in `src/config.ts`
- Never log to stdout as it breaks MCP. Only log to stderr

---

# Effect Reference Guide

Below is a practical **Effect (TypeScript) reference guide**—a “most-used first” cheat‑sheet you can keep at hand. It focuses on the stable, everyday APIs you’ll reach for when building real apps with Effect. I link each section to the official docs so you can jump deeper when needed.

## 0) The mental model

- **Effect<A, E, R>** — a _description_ of a computation that:
  - **Succeeds** with `A`,
  - may **fail** with a _typed_ error `E`,
  - and may **require** services / dependencies `R`.
    Read: “_This effect needs `R`, might fail with `E`, and if it works you get `A`._” ([Effect][1])

- You write programs by **composing** effects (map/flatMap/zip/…) and **running** them at the edge (`Effect.run*`). ([EffectTS][2])

---

## 1) Imports & common style

```ts
import {
  Effect,
  Layer,
  Context,
  Duration,
  Schedule,
  Ref,
  Queue,
  PubSub,
  Deferred,
  Semaphore,
  Stream,
  Logger,
  Metric,
} from "effect";
```

- APIs are offered in **dual** forms (data-first & data-last). Use data-last with `pipe` or `effect.pipe(...)`. ([Effect][3])
- Prefer `Effect.gen(function* () { ... })` for readable, sequential code: you can `yield*` other effects/services.

---

## 2) Creating effects (sync & async)

```ts
// Pure successes & failures
const ok = Effect.succeed(42);
const failE = Effect.fail(new Error("boom"));

// Synchronous side-effects
const now = Effect.sync(() => Date.now());
const safeTry = Effect.try({
  try: () => mightThrow(),
  catch: (e) => new DomainErr(e),
});

// Async (Promise-based)
const fromP = Effect.promise(() => fetch(url).then((r) => r.json()));
const safeTryP = Effect.tryPromise({
  try: () => fetch(url),
  catch: (e) => new HttpErr(e),
});

// Defer building an effect until use (avoid accidental capture)
const suspended = Effect.suspend(() => Effect.succeed(expensive()));
```

- Use `Effect.suspend` when constructing effects with captured state or side‑effects to ensure fresh evaluation. ([Effect][4])
- Use `Effect.try` / `Effect.tryPromise` to **map exceptions/rejections** into your typed error channel. ([Effect][4])

---

## 3) Composing & control flow

```ts
const program = ok.pipe(
  Effect.map((n) => n + 1),
  Effect.flatMap((n) => Effect.succeed(n * 2)),
  Effect.zip(Effect.succeed("units")), // tuple
  Effect.map(([n, u]) => `${n} ${u}`),
);
```

Useful helpers:

```ts
Effect.when(condition, Effect.log("only if true")); // conditional
Effect.forEach(items, (item) => work(item), { concurrency: 8 });
Effect.all(effects, { concurrency: "unbounded" }); // run many
Effect.race(e1, e2); // first to finish wins
```

See full list of control-flow & collecting operators. ([Effect][5])
Concurrency knobs (`concurrency: number | "unbounded" | "inherit"`) apply across many “batch” APIs (`forEach`, `all`, streams, etc.). ([Effect][6])

---

## 4) Running effects

```ts
await Effect.runPromise(program); // bridge to Promise
const value = Effect.runSync(Effect.succeed(1)); // sync-only
const fiber = Effect.runFork(Effect.log("Hello")); // fire-and-forget fiber (supervised by runtime)
```

Use `runPromise` at integration boundaries; `runFork` returns a **fiber** you can observe/cancel. ([EffectTS][2])

---

## 5) Services (Context) & dependency injection (Layer)

### Define a service & use it

```ts
interface Clock {
  readonly now: Effect.Effect<number>;
}
const Clock = Context.Tag<Clock>(); // service "key" (Tag)

const usesClock = Effect.gen(function* () {
  const clock = yield* Clock;
  return yield* clock.now;
});
```

### Provide an implementation (Layer)

```ts
const LiveClock = Layer.succeed(Clock, { now: Effect.sync(() => Date.now()) });

await Effect.runPromise(usesClock.pipe(Effect.provide(LiveClock)));
```

- **Tags** declare _what_ you need; **Layers** declare _how to build/provide_ it (including wiring transitive deps). ([Effect][7])
- Layers are **memoized** by default to avoid duplicate startups (configurable). ([Effect][8])
- Some **default services** (logger, random, clock, etc.) ship out of the box and can be replaced. ([Effect][9])

---

## 6) Error management (typed failures & defects)

- **Two error classes**:
  - **Expected (typed)** domain failures in the `E` channel (use `fail`/`try`/`tryPromise`, handle with `catch*` family).
  - **Unexpected (defects)** like programmer bugs—tracked by the runtime, accessible via causes/sandboxing. ([Effect][10])

```ts
const safe = risky.pipe(
  Effect.catchAll((err) => Effect.logError(err)), // handle typed error
);

const sandboxed = Effect.sandbox(risky); // expose Cause (fail/defect/interruption)
```

- Time limits: `Effect.timeout(d)` / `timeoutTo(...)`; consider `Effect.disconnect` to let work continue in the background on timeout. ([Effect][11])
- Inspect precise failure reasons with **Cause**. ([Effect][12])

---

## 7) Retrying & repetition (Schedule)

```ts
const policy = Schedule.exponential("100 millis") // backoff
  .pipe(Schedule.jittered, Schedule.recurs(5)); // add jitter; cap attempts

const fetched = Effect.tryPromise({
  try: () => fetch(url),
  catch: () => new HttpErr(),
}).pipe(Effect.retry(policy));
```

- **Schedule<Out, In, R>** describes _when/how often_ to repeat/retry. Built‑ins: `spaced`, `exponential`, `recurs`, `cron`, and compositors. ([Effect][13])
- `Effect.retry` / `retryOrElse` pair effects with schedules. ([Effect][14])

---

## 8) Resource safety (Scope, acquire/release)

```ts
const resource = Effect.acquireRelease(
  Effect.promise(() => openHandle()),
  (h) => Effect.promise(() => h.close()),
);

const use = Effect.scoped(
  Effect.gen(function* () {
    const h = yield* resource;
    // ... use h
  }),
);
```

- `acquireRelease` & **Scope** guarantee finalization on success, failure, or interruption; `Effect.scoped(...)` ties lifetimes to a scope automatically. ([Effect][15])

---

## 9) Concurrency primitives

- **Fibers** — lightweight, interruptible threads of Effect; use `Effect.fork`, `fiber.join`, `fiber.interrupt`, scoped for safe lifetimes. ([Effect][16])
- **Deferred<A,E>** — a one‑shot promise you can await/complete. Great for coordination. ([Effect][17])
- **Queue<T>** — in‑memory queue with backpressure (bounded/unbounded/dropping/sliding). Pairs of `offer`/`take`. ([Effect][18])
- **PubSub<T>** — broadcast to many subscribers (`publish` / `subscribe`). ([Effect][19])
- **Semaphore** — limit concurrency via permits (`withPermits(n)(effect)`). ([Effect][20])

Many “batch” combinators accept a `{ concurrency }` option so you can tune parallelism without manual primitives. ([Effect][6])

---

## 10) State management (Refs)

- **Ref<A>** — atomic mutable cell for shared state across fibers.
  `Ref.make`, `get`, `set`, `update`, `modify`.
- **SynchronizedRef<A>** — `Ref` with fairness guarantees under contention.
- **SubscriptionRef<A>** — read‑optimized ref that supports subscriptions to value changes. ([Effect][21])

---

## 11) Streams (pull-based, backpressured)

- **Stream<A, E, R>** is to “many values” what `Effect` is to “one value”.
- Create: `Stream.make(...)`, `fromIterable`, `fromAsyncIterable`, `fromQueue`, `fromPubSub`, `range`, `iterate`, `scoped`, `fromSchedule`…
- Transform: `map`, `filter`, `flatMap`, `merge`, `zip`, `via(Sink)`…
- Consume: `Stream.runCollect`, `runForEach`, `runFold`, or by **Sink**. ([Effect][22])

Example:

```ts
const q = yield * Queue.bounded<number>(100);

const producer = Effect.forEach([1, 2, 3], (n) => q.offer(n));
const consumer = Stream.fromQueue(q).pipe(
  Stream.runForEach((n) => Effect.log(n)),
);

await Effect.runPromise(Effect.all([producer, consumer]));
```

---

## 12) Observability (logs • metrics • traces)

### Logging

```ts
const program = Effect.log("hello").pipe(
  Effect.annotateLogs({ requestId: "abc" }),
  Effect.withLogSpan("handleRequest"),
);
```

- Dynamic log levels, annotations, spans; plug pretty/JSON loggers or file logger via platform tools. ([Effect][23])

### Metrics

- Built‑ins: **Counter**, **Gauge**, **Histogram**, **Summary**, **Frequency**; tag metrics for rich analysis. ([Effect][24])

### Tracing

- Add spans with `Effect.withSpan("name", effect)`; nest spans; export to backends. Logs can appear as span events. ([Effect][25])

- Supervisors can watch fibers for lifecycle events. ([Effect][26])

---

## 13) Configuration

- Declare configuration needs against a **ConfigProvider** and decode with schemas. Swap providers per environment (env vars, files, etc.). ([Effect][27])
- You can also configure default services (e.g., default config provider) globally. ([Effect][9])

---

## 14) Data validation with Schema (first‑class in Effect)

```ts
import { Schema } from "effect";

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number });
type Person = Schema.Type<typeof Person>;

const decode = Schema.decodeUnknown(Person); // (u: unknown) => Effect.Effect<Person, ParseError>
```

- Parse/encode with `decode*`/`encode*` helpers.
- Compose & transform schemas; async transforms can **return Effect** and declare dependencies in `R`. ([Effect][28])

---

## 15) Time utilities

- Use `Duration` helpers (`millis`, `"1 second"` shorthand in many APIs) with sleep/timeout/schedules. ([Effect][29])

---

## 16) Patterns you’ll write all the time

### A. Robust HTTP call (timeout + retry w/ backoff + logging)

```ts
const fetchJson = (url: string) =>
  Effect.gen(function* () {
    yield* Effect.log(`GET ${url}`);
    const res = yield* Effect.tryPromise({
      try: () => fetch(url),
      catch: (e) => new Error(`Network: ${String(e)}`),
    });
    if (!res.ok) return yield* Effect.fail(new Error(`HTTP ${res.status}`));
    return yield* Effect.promise(() => res.json() as Promise<unknown>);
  }).pipe(
    Effect.timeout("2 seconds"),
    Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.recurs(4))),
  );
```

This combines **typed errors**, **timeouts**, and **retries** with an **exponential backoff** policy. ([Effect][11])

### B. Acquire/use/release with scope

```ts
const withFile = Effect.acquireUseRelease(
  Effect.promise(() => fs.promises.open(path, "r")),
  (f) => Effect.promise(() => f.close()),
  (f) => Effect.promise(() => f.read(/*...*/)),
);
```

Everything is cleaned up even on failure/interruption. ([Effect][15])

### C. Parallel work with bounded concurrency

```ts
const results = await Effect.runPromise(
  Effect.forEach(urls, fetchJson, { concurrency: 8 }),
);
```

Bounded concurrency keeps load under control. ([Effect][6])

---

## Quick operator index (memorize these)

- **Creation**: `succeed`, `fail`, `sync`, `try`, `promise`, `tryPromise`, `suspend`, `sleep`. ([Effect][4])
- **Composition**: `map`, `flatMap`, `zip/zipWith`, `all`, `forEach`, `race`. ([Effect][5])
- **Error**: `catchAll`, `catchTag`, `mapError`, `sandbox`, `timeout/timeoutTo`. ([Effect][30])
- **Concurrency**: `fork`, `withConcurrency` options in `all/forEach`, fibers (`join`, `interrupt`). ([Effect][31])
- **Services**: `Context.Tag`, `Layer.succeed/scoped/effect`, `Effect.provide`. ([Effect][7])
- **Scheduling**: `Schedule.spaced/exponential/recurs/jittered/cron`, `Effect.retry/repeat`. ([Effect][13])
- **Resource mgmt**: `acquireRelease`, `acquireUseRelease`, `scoped`, `Scope`. ([Effect][15])
- **State & sync**: `Ref`, `SynchronizedRef`, `SubscriptionRef`, `Deferred`, `Queue`, `PubSub`, `Semaphore`. ([Effect][21])
- **Streams**: `Stream.make/from*`, `map/filter/flatMap/merge/zip`, `runCollect/runForEach`, `Sink`. ([Effect][22])
- **Observability**: `Effect.log/*`, `annotateLogs`, `withLogSpan`, `Logger`/`PlatformLogger`, `Metric.*`, `Effect.withSpan`. ([Effect][23])
- **Schema**: `Schema.Struct`, `Type<typeof S>`, `decode*/encode*`, `transform/compose`. ([Effect][28])

---

## Where to dig deeper (official docs)

- **Getting started**: type, creation, running, generators, pipelines. ([Effect][1])
- **Requirements**: services & layers; memoization; defaults. ([Effect][7])
- **Error management**: two error types, sandboxing, retrying, timing out, cause. ([Effect][10])
- **Resource mgmt**: intro + scope. ([Effect][32])
- **Concurrency**: fibers, primitives, basic concurrency. ([Effect][16])
- **Streams**: intro, creating, consuming, operations. ([Effect][22])
- **Observability**: logging, metrics, tracing, supervisor. ([Effect][23])
- **Configuration**: high‑level overview. ([Effect][27])
- **Schema**: getting started & transformations. ([Effect][28])

---

### Tips & gotchas

- Prefer **typed errors** (`fail/try/tryPromise`) instead of throwing; reserve defects for truly unexpected issues. ([Effect][10])
- Wrap potentially long actions with **timeouts** and **retry** policies; add **jitter** to avoid thundering herds. ([Effect][11])
- Use **Layers** to wire external systems (DBs, HTTP clients). They make tests & composition far easier.
- Keep parallelism in check with `{ concurrency: n }` or `Semaphore`. ([Effect][6])
- For IO‑like sequences, reach for **Stream** and `Stream.run*` consumers instead of manual loops. ([Effect][33])

---

If you want, tell me what you’re building (CLI, API server, ETL, UI integration, etc.) and I’ll tailor this guide into a **project‑specific skeleton** with concrete Layers, Schedules, and Stream topologies.

[1]: https://effect.website/docs/getting-started/the-effect-type/ "The Effect Type | Effect Documentation"
[2]: https://effect-ts.github.io/effect/effect/Effect.ts.html?utm_source=chatgpt.com "effect - Effect.ts"
[3]: https://effect.website/docs/code-style/dual/?utm_source=chatgpt.com "Dual APIs"
[4]: https://effect.website/docs/getting-started/creating-effects/?utm_source=chatgpt.com "Creating Effects | Effect Documentation - Effect website"
[5]: https://effect.website/docs/getting-started/control-flow/ "Control Flow Operators | Effect Documentation"
[6]: https://effect.website/docs/concurrency/basic-concurrency/?utm_source=chatgpt.com "Basic Concurrency"
[7]: https://effect.website/docs/concurrency/fibers/ "Fibers | Effect Documentation"
[8]: https://effect.website/docs/requirements-management/layer-memoization/ "Layer Memoization | Effect Documentation"
[9]: https://effect.website/docs/requirements-management/default-services/ "Default Services | Effect Documentation"
[10]: https://effect.website/docs/error-management/two-error-types/?utm_source=chatgpt.com "Two Types of Errors"
[11]: https://effect.website/docs/error-management/timing-out/?utm_source=chatgpt.com "Timing Out | Effect Documentation"
[12]: https://effect.website/docs/data-types/cause/?utm_source=chatgpt.com "Cause"
[13]: https://effect.website/docs/scheduling/introduction/ "Introduction | Effect Documentation"
[14]: https://effect.website/docs/error-management/retrying/?utm_source=chatgpt.com "Retrying | Effect Documentation"
[15]: https://effect.website/docs/resource-management/scope/?utm_source=chatgpt.com "Scope"
[16]: https://effect.website/docs/error-management/retrying/ "Retrying | Effect Documentation"
[17]: https://effect.website/docs/concurrency/deferred/?utm_source=chatgpt.com "Deferred | Effect Documentation"
[18]: https://effect.website/docs/concurrency/queue/?utm_source=chatgpt.com "Queue | Effect Documentation"
[19]: https://effect.website/docs/concurrency/pubsub/?utm_source=chatgpt.com "PubSub"
[20]: https://effect.website/docs/concurrency/semaphore/?utm_source=chatgpt.com "Semaphore | Effect Documentation"
[21]: https://effect.website/docs/state-management/ref/ "Ref | Effect Documentation"
[22]: https://effect.website/docs/stream/introduction/ "Introduction to Streams | Effect Documentation"
[23]: https://effect.website/docs/observability/logging/?utm_source=chatgpt.com "Logging"
[24]: https://effect.website/docs/observability/metrics/?utm_source=chatgpt.com "Metrics in Effect | Effect Documentation"
[25]: https://effect.website/docs/observability/tracing/ "Tracing in Effect | Effect Documentation"
[26]: https://effect.website/docs/observability/supervisor/ "Supervisor | Effect Documentation"
[27]: https://effect.website/docs/configuration/?utm_source=chatgpt.com "Configuration"
[28]: https://effect.website/docs/schema/getting-started/ "Getting Started | Effect Documentation"
[29]: https://effect.website/docs/data-types/duration/?utm_source=chatgpt.com "Duration | Effect Documentation"
[30]: https://effect.website/docs/error-management/sandboxing/?utm_source=chatgpt.com "Sandboxing | Effect Documentation"
[31]: https://effect.website/docs/concurrency/basic-concurrency/ "Basic Concurrency | Effect Documentation"
[32]: https://effect.website/docs/resource-management/introduction/?utm_source=chatgpt.com "Introduction"
[33]: https://effect.website/docs/stream/consuming-streams/?utm_source=chatgpt.com "Consuming Streams"
