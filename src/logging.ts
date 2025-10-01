import { inspect } from "node:util";
import { Cause, HashMap, Logger, pipe } from "effect";
import * as Arr from "effect/Array";

const formatAnnotations = (annotations: HashMap.HashMap<string, unknown>) =>
  pipe(
    HashMap.toEntries(annotations),
    Arr.fromIterable,
    Arr.match({
      onEmpty: () => "",
      onNonEmpty: (entries) =>
        pipe(
          entries,
          Arr.map(([key, value]) => {
            const rendered =
              typeof value === "string" ? value : inspect(value, { depth: 4 });
            return `${key}=${rendered}`;
          }),
          Arr.join(" "),
          (serialized) => ` ${serialized}`,
        ),
    }),
  );

const formatCause = (cause: Cause.Cause<unknown>) =>
  Cause.isEmpty(cause) ? "" : `\n${Cause.pretty(cause)}`;

const formatMessage = (message: unknown) =>
  typeof message === "string" ? message : inspect(message, { depth: 4 });

const stderrLogger = Logger.make(
  ({ annotations, cause, date, logLevel, message }) => {
    const timestamp = date.toISOString();
    const annotationText = formatAnnotations(annotations);
    const causeText = formatCause(cause);
    const renderedMessage = formatMessage(message);

    console.error(
      `${timestamp} [${logLevel.label}] ${renderedMessage}${annotationText}${causeText}`,
    );
  },
);

/**
 * Effect Layer that replaces the default logger with a stderr-based logger.
 * Logs are written to stderr (not stdout) to avoid interfering with MCP STDIO transport.
 * Includes timestamp, log level, message, annotations, and cause information.
 *
 * This layer should be provided to Effect programs to ensure proper logging behavior.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* Effect.logInfo("Server started");
 * }).pipe(Effect.provide(StderrLoggerLayer));
 * ```
 */
export const StderrLoggerLayer = Logger.replace(
  Logger.defaultLogger,
  stderrLogger,
);
