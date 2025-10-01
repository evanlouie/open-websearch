import { Page } from "playwright";
import { BaseEngine } from "./BaseEngine.js";
import { SearchResult } from "../types.js";

export class BingEngine extends BaseEngine {
  readonly name = "bing";
  readonly baseUrl = "https://www.bing.com";

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
  }

  protected async extractResults(
    page: Page,
    limit: number,
  ): Promise<SearchResult[]> {
    // Wait for results to load
    await page.waitForSelector("#b_results", { timeout: 10000 });

    // Extract results using page.$$eval
    const results = await page.$$eval(".b_algo", (elements) => {
      return elements
        .map((el) => {
          const titleEl = el.querySelector("h2");
          const linkEl = el.querySelector("a");
          const descEl = el.querySelector(".b_caption p");
          const sourceEl = el.querySelector(".b_tpcn");

          return {
            title: titleEl?.textContent?.trim() || "",
            url: linkEl?.getAttribute("href") || "",
            description: descEl?.textContent?.trim() || "",
            source: sourceEl?.textContent?.trim() || "",
            engine: "bing",
          };
        })
        .filter((result) => result.url.startsWith("http"));
    });

    return results.slice(0, limit);
  }
}

// Export singleton instance
export const bingEngine = new BingEngine();
