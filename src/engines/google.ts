import { Page } from "playwright";
import { BaseEngine } from "./BaseEngine.js";
import { SearchResult } from "../types.js";

/**
 * Google Search Engine
 *
 * ⚠️ EXPERIMENTAL: Google has aggressive bot detection.
 * This engine may fail with CAPTCHA challenges.
 * For production use, consider alternative engines or commercial proxies.
 */
export class GoogleEngine extends BaseEngine {
  readonly name = "google";
  readonly baseUrl = "https://www.google.com";

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}&hl=en`;
  }

  protected async extractResults(
    page: Page,
    limit: number,
  ): Promise<SearchResult[]> {
    // Google-specific: May need to handle CAPTCHA detection
    try {
      await page.waitForSelector(".g", { timeout: 15000 });
    } catch (error) {
      // Check if CAPTCHA page
      const isCaptcha = await page
        .$('iframe[src*="recaptcha"]')
        .catch(() => null);
      if (isCaptcha) {
        throw new Error(
          "Google CAPTCHA detected - search blocked. This is expected for automated requests. Try using Bing, DuckDuckGo, or Brave instead.",
        );
      }
      throw error;
    }

    // Extract results using page.$$eval
    const results = await page.$$eval(".g", (elements) => {
      return elements
        .map((el) => {
          const titleEl = el.querySelector("h3");
          const linkEl = el.querySelector(".yuRUbf > a");
          const descEl = el.querySelector(".VwiC3b");
          const sourceEl = el.querySelector("cite");

          return {
            title: titleEl?.textContent?.trim() || "",
            url: linkEl?.getAttribute("href") || "",
            description: descEl?.textContent?.trim() || "",
            source: sourceEl?.textContent?.trim() || "",
            engine: "google",
          };
        })
        .filter((result) => result.url.startsWith("http"));
    });

    return results.slice(0, limit);
  }
}

// Export singleton instance
export const googleEngine = new GoogleEngine();
