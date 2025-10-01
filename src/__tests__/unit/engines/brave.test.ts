import { describe, test, expect, afterEach } from "bun:test";
import { braveEngine, BraveEngine } from "../../../engines/brave.js";
import { browserPool } from "../../../browser/BrowserPool.js";

describe("BraveEngine", () => {
  afterEach(async () => {
    // Clean up browser pool between tests
    await browserPool.close();
  });

  describe("Configuration", () => {
    test("has correct name", () => {
      expect(braveEngine.name).toBe("brave");
    });

    test("has correct baseUrl", () => {
      expect(braveEngine.baseUrl).toBe("https://search.brave.com");
    });

    test("is a singleton instance", () => {
      expect(braveEngine).toBeInstanceOf(BraveEngine);
    });
  });

  describe("buildSearchUrl", () => {
    test("builds correct search URL", () => {
      const url = (braveEngine as any).buildSearchUrl("test query");
      expect(url).toBe("https://search.brave.com/search?q=test%20query");
    });

    test("encodes special characters", () => {
      const url = (braveEngine as any).buildSearchUrl("privacy & search!");
      expect(url).toContain(encodeURIComponent("privacy & search!"));
      expect(url).not.toContain("&");
      expect(url).not.toContain(" ");
    });

    test("handles empty query", () => {
      const url = (braveEngine as any).buildSearchUrl("");
      expect(url).toBe("https://search.brave.com/search?q=");
    });
  });

  describe("search (unit)", () => {
    test("search method exists and returns Promise", () => {
      const result = braveEngine.search("test", 10);
      expect(result).toBeInstanceOf(Promise);
    });

    test("healthCheck method exists and returns Promise", () => {
      const result = braveEngine.healthCheck();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("Interface Compliance", () => {
    test("implements all SearchEngine methods", () => {
      expect(typeof braveEngine.search).toBe("function");
      expect(typeof braveEngine.healthCheck).toBe("function");
    });

    test("has required properties", () => {
      expect(typeof braveEngine.name).toBe("string");
      expect(typeof braveEngine.baseUrl).toBe("string");
    });
  });
});
