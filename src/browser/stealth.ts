import { Page } from "playwright";

/**
 * Get stealth browser arguments for maximum bot detection evasion
 * These args help avoid detection by hiding automation signals
 */
export function getStealthArgs(): string[] {
  return [
    // Disable automation flags
    "--disable-blink-features=AutomationControlled",

    // Sandbox compatibility: required when running as root (Docker/CI)
    "--no-sandbox",
    "--disable-setuid-sandbox",

    // Performance and resource optimizations
    "--disable-dev-shm-usage",

    // Additional stealth measures
    "--disable-features=IsolateOrigins,site-per-process",

    // GPU and rendering
    "--disable-gpu",
    "--disable-software-rasterizer",

    // Extensions and components
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",

    // Misc
    "--no-first-run",
    "--no-default-browser-check",
  ];
}

/**
 * Apply additional stealth configurations to a page
 * This includes randomized fingerprints and hiding webdriver properties
 */
export async function applyStealthConfig(page: Page): Promise<void> {
  // Override navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  // Randomize viewport for fingerprint variation
  const viewport = getRandomViewport();
  await page.setViewportSize(viewport);

  // Set realistic user agent if needed
  // await page.setExtraHTTPHeaders({
  //     'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  // });
}

/**
 * Get a randomized viewport size from common screen resolutions
 */
function getRandomViewport(): { width: number; height: number } {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ];

  return viewports[Math.floor(Math.random() * viewports.length)];
}

/**
 * Future enhancements for fingerprint randomization:
 * - User agent rotation
 * - Timezone randomization
 * - Language preference variation
 * - Canvas fingerprint spoofing
 * - WebGL fingerprint spoofing
 */
