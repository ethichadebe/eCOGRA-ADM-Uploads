// src/automation/helpers/waitForDashboard.js
/**
 * Wait until the post-login dashboard really rendered.
 * We try a few robust signals seen in your screenshots: page body content,
 * "Asset Publisher" section, or any left menu entries.
 *
 * @param {import('playwright').Page} page
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export async function waitForDashboard(page, timeoutMs = 12000) {
    const start = Date.now();
  
    // probes we consider as "ready" signals
    const probes = [
      'text="Asset Publisher"',
      'text=/ONLINE\\s+SERVICES/i',
      'header:has-text("Ministero dell\'Economia")',
      'main' // generic fallback
    ];
  
    while (Date.now() - start < timeoutMs) {
      for (const p of probes) {
        const loc = page.locator(p);
        if (await loc.count().catch(() => 0)) {
          const vis = await loc.first().isVisible().catch(() => false);
          if (vis) return true;
        }
      }
      // also guard against a truly empty render
      const bodyTextLen = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
      if (bodyTextLen > 50) return true;
  
      await page.waitForTimeout(300);
    }
    return false;
  }
  