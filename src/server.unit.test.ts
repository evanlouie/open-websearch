import { describe, test, expect } from "bun:test";
import { Either, Option, pipe } from "effect";
import {
  getHeaderValue,
  ensureStreamableTransport,
  ensureSseTransport,
  requireStreamableTransport,
  requireSseTransport,
  missingSessionMessage,
  type Transports,
} from "./server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { IncomingMessage } from "node:http";

describe("Server - getHeaderValue", () => {
  test("returns Some for existing string header", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": "application/json",
    };

    const result = getHeaderValue(headers, "content-type");

    expect(Option.isSome(result)).toBe(true);
    const value = pipe(result, Option.getOrThrow);
    expect(value).toBe("application/json");
  });

  test("returns Some for existing array header (first element)", () => {
    const headers: IncomingMessage["headers"] = {
      "set-cookie": ["cookie1=value1", "cookie2=value2"],
    };

    const result = getHeaderValue(headers, "set-cookie");

    expect(Option.isSome(result)).toBe(true);
    const value = pipe(result, Option.getOrThrow);
    expect(value).toBe("cookie1=value1");
  });

  test("returns None for non-existent header", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": "application/json",
    };

    const result = getHeaderValue(headers, "authorization");

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for undefined header", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": undefined,
    };

    const result = getHeaderValue(headers, "content-type");

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for empty array header", () => {
    const headers: IncomingMessage["headers"] = {
      "set-cookie": [],
    };

    const result = getHeaderValue(headers, "set-cookie");

    expect(Option.isNone(result)).toBe(true);
  });

  test("trims whitespace from header value", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": "  application/json  ",
    };

    const result = getHeaderValue(headers, "content-type");

    expect(Option.isSome(result)).toBe(true);
    const value = pipe(result, Option.getOrThrow);
    expect(value).toBe("application/json");
  });

  test("returns None for whitespace-only header value", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": "   ",
    };

    const result = getHeaderValue(headers, "content-type");

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for empty string header value", () => {
    const headers: IncomingMessage["headers"] = {
      "content-type": "",
    };

    const result = getHeaderValue(headers, "content-type");

    expect(Option.isNone(result)).toBe(true);
  });

  test("handles numeric header values as strings", () => {
    const headers: IncomingMessage["headers"] = {
      "content-length": "42",
    };

    const result = getHeaderValue(headers, "content-length");

    expect(Option.isSome(result)).toBe(true);
    const value = pipe(result, Option.getOrThrow);
    expect(value).toBe("42");
  });
});

describe("Server - ensureStreamableTransport", () => {
  test("returns Some when transport exists", () => {
    const mockTransport = {} as StreamableHTTPServerTransport;
    const transports: Transports = {
      streamable: { "session-123": mockTransport },
      sse: {},
    };

    const result = ensureStreamableTransport(transports, "session-123");

    expect(Option.isSome(result)).toBe(true);
    const transport = pipe(result, Option.getOrThrow);
    expect(transport).toBe(mockTransport);
  });

  test("returns None when transport does not exist", () => {
    const transports: Transports = {
      streamable: {},
      sse: {},
    };

    const result = ensureStreamableTransport(transports, "session-123");

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for different session ID", () => {
    const mockTransport = {} as StreamableHTTPServerTransport;
    const transports: Transports = {
      streamable: { "session-123": mockTransport },
      sse: {},
    };

    const result = ensureStreamableTransport(transports, "session-456");

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("Server - ensureSseTransport", () => {
  test("returns Some when transport exists", () => {
    const mockTransport = {} as SSEServerTransport;
    const transports: Transports = {
      streamable: {},
      sse: { "session-123": mockTransport },
    };

    const result = ensureSseTransport(transports, "session-123");

    expect(Option.isSome(result)).toBe(true);
    const transport = pipe(result, Option.getOrThrow);
    expect(transport).toBe(mockTransport);
  });

  test("returns None when transport does not exist", () => {
    const transports: Transports = {
      streamable: {},
      sse: {},
    };

    const result = ensureSseTransport(transports, "session-123");

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for different session ID", () => {
    const mockTransport = {} as SSEServerTransport;
    const transports: Transports = {
      streamable: {},
      sse: { "session-123": mockTransport },
    };

    const result = ensureSseTransport(transports, "session-456");

    expect(Option.isNone(result)).toBe(true);
  });
});

describe("Server - requireStreamableTransport", () => {
  test("returns Right when transport exists", () => {
    const mockTransport = {} as StreamableHTTPServerTransport;
    const transports: Transports = {
      streamable: { "session-123": mockTransport },
      sse: {},
    };

    const result = requireStreamableTransport(transports, "session-123");

    expect(Either.isRight(result)).toBe(true);
    const transport = pipe(result, Either.getOrThrow);
    expect(transport).toBe(mockTransport);
  });

  test("returns Left with error message when transport does not exist", () => {
    const transports: Transports = {
      streamable: {},
      sse: {},
    };

    const result = requireStreamableTransport(transports, "session-123");

    expect(Either.isLeft(result)).toBe(true);
    pipe(
      result,
      Either.match({
        onLeft: (error) => {
          expect(error).toBe(missingSessionMessage);
        },
        onRight: () => {
          throw new Error("Expected Left but got Right");
        },
      }),
    );
  });

  test("returns Left for different session ID", () => {
    const mockTransport = {} as StreamableHTTPServerTransport;
    const transports: Transports = {
      streamable: { "session-123": mockTransport },
      sse: {},
    };

    const result = requireStreamableTransport(transports, "session-456");

    expect(Either.isLeft(result)).toBe(true);
  });
});

describe("Server - requireSseTransport", () => {
  test("returns Right when transport exists", () => {
    const mockTransport = {} as SSEServerTransport;
    const transports: Transports = {
      streamable: {},
      sse: { "session-123": mockTransport },
    };

    const result = requireSseTransport(transports, "session-123");

    expect(Either.isRight(result)).toBe(true);
    const transport = pipe(result, Either.getOrThrow);
    expect(transport).toBe(mockTransport);
  });

  test("returns Left with error message when transport does not exist", () => {
    const transports: Transports = {
      streamable: {},
      sse: {},
    };

    const result = requireSseTransport(transports, "session-123");

    expect(Either.isLeft(result)).toBe(true);
    pipe(
      result,
      Either.match({
        onLeft: (error) => {
          expect(error).toBe("No transport found for sessionId");
        },
        onRight: () => {
          throw new Error("Expected Left but got Right");
        },
      }),
    );
  });

  test("returns Left for different session ID", () => {
    const mockTransport = {} as SSEServerTransport;
    const transports: Transports = {
      streamable: {},
      sse: { "session-123": mockTransport },
    };

    const result = requireSseTransport(transports, "session-456");

    expect(Either.isLeft(result)).toBe(true);
  });
});
