import { chromium } from 'playwright';
import path from 'path';

/**
 * probeRun
 * Opens a URL, optionally waits for a selector, returns title & saves a screenshot.
 * This is intentionally simple and synchronous so you can see each moving piece.
 *
 * @param {object} payload - { url: string, waitFor?: string }
 * @param {string} runDir - where to save artifacts
 * @returns {object} - { title, screenshotPath, timing }
 */
export async function probeRun(payload, runDir) {
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true }); // set false to watch it
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // 1) Navigate to target URL
    await page.goto(payload.url, { timeout: 30_000, waitUntil: 'domcontentloaded' });

    // 2) If caller provided a CSS selector to wait for, do so (useful for SPA readiness)
    if (payload.waitFor) {
      await page.waitForSelector(payload.waitFor, { timeout: 30_000 });
    }

    // 3) Collect basic info: title is a nice smoke test
    const title = await page.title();

    // 4) Save a screenshot into this run's artifact folder
    const screenshotPath = path.join(runDir, '01_probe.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // 5) Return structured result (easy to assert on in tests)
    return {
      ok: true,
      title,
      screenshotPath,
      timing: { ms: Date.now() - startedAt }
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
