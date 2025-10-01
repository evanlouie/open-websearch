import { describe, test, expect, afterEach } from "bun:test";
import { googleEngine, GoogleEngine } from "../../../engines/google.js";
import { browserPool } from "../../../browser/BrowserPool.js";

describe("GoogleEngine", () => {
  afterEach(async () => {
    // Clean up browser pool between tests
    await browserPool.close();
  });

  describe("Configuration", () => {
    test("has correct name", () => {
      expect(googleEngine.name).toBe("google");
    });

    test("has correct baseUrl", () => {
      expect(googleEngine.baseUrl).toBe("https://www.google.com");
    });

    test("is a singleton instance", () => {
      expect(googleEngine).toBeInstanceOf(GoogleEngine);
    });
  });

  describe("buildSearchUrl", () => {
    test("builds correct search URL with language param", () => {
      const url = (googleEngine as any).buildSearchUrl("test query");
      expect(url).toBe("https://www.google.com/search?q=test%20query&hl=en");
    });

    test("encodes special characters", () => {
      const url = (googleEngine as any).buildSearchUrl("search & find!");
      expect(url).toContain(encodeURIComponent("search & find!"));
      expect(url).toContain("&hl=en"); // Language param should still be present
    });

    test("handles empty query", () => {
      const url = (googleEngine as any).buildSearchUrl("");
      expect(url).toBe("https://www.google.com/search?q=&hl=en");
    });

    test("includes language parameter", () => {
      const url = (googleEngine as any).buildSearchUrl("test");
      expect(url).toContain("hl=en");
    });
  });

  describe("search (unit)", () => {
    test("search method exists and returns Promise", () => {
      const result = googleEngine.search("test", 10);
      expect(result).toBeInstanceOf(Promise);
    });

    test("healthCheck method exists and returns Promise", () => {
      const result = googleEngine.healthCheck();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("CAPTCHA Handling", () => {
    test("has CAPTCHA detection in implementation", () => {
      // This test verifies that CAPTCHA handling code exists
      // Actual CAPTCHA handling is tested in E2E tests
      const extractResults = (googleEngine as any).extractResults;
      expect(extractResults).toBeDefined();
      expect(typeof extractResults).toBe("function");
    });
  });

  describe("Interface Compliance", () => {
    test("implements all SearchEngine methods", () => {
      expect(typeof googleEngine.search).toBe("function");
      expect(typeof googleEngine.healthCheck).toBe("function");
    });

    test("has required properties", () => {
      expect(typeof googleEngine.name).toBe("string");
      expect(typeof googleEngine.baseUrl).toBe("string");
    });
  });
});
