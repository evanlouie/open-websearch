import { inspect } from "node:util";
import { Cause, HashMap, Logger } from "effect";

const formatAnnotations = (annotations: HashMap.HashMap<string, unknown>) => {
  const entries = HashMap.toEntries(annotations);
  if (entries.length === 0) {
    return "";
  }

  const serialized = entries.map(([key, value]) => {
    const rendered =
      typeof value === "string" ? value : inspect(value, { depth: 4 });
    return `${key}=${rendered}`;
  });

  return ` ${serialized.join(" ")}`;
};

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

export const StderrLoggerLayer = Logger.replace(
  Logger.defaultLogger,
  stderrLogger,
);
