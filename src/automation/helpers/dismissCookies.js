// src/automation/helpers/dismissCookies.js
/**
 * Dismiss the ADM cookie banner if present and wait until it is gone.
 * We also wait for network idle so the page can re-render after the
 * deleteCookies request the site fires.
 *
 * @param {import('playwright').Page} page
 * @param {string} afterShot - screenshot path after action (optional)
 * @returns {Promise<{ dismissed: boolean, reason?: string }>}
 */
export async function dismissCookies(page, afterShot) {
    const BAR = "#cookiebar-adm";
    const LINK_LOCATORS = [
      `${BAR} a[aria-label*="Chiudi e rifiuta tutto"]`,
      `${BAR} a:has-text("Close and reject cookies")`,
      `${BAR} a[href*="deleteCookies"]`
    ];
  
    try {
      // Is the bar present/visible?
      const bar = page.locator(BAR);
      const visible = await bar.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) return { dismissed: false, reason: "not-visible" };
  
      // Click a valid close-link
      for (const sel of LINK_LOCATORS) {
        const link = page.locator(sel).first();
        if (await link.count()) {
          try {
            await Promise.allSettled([
              link.click({ timeout: 4000 }),
              // some implementations do a mini-navigation; don't miss it
              page.waitForLoadState("domcontentloaded", { timeout: 8000 }),
            ]);
  
            // Wait for banner to vanish
            await bar.waitFor({ state: "detached", timeout: 7000 })
                     .catch(async () => {
                       // defensive: if still attached, hide it so we can proceed
                       await page.evaluate((sel) => {
                         const el = document.querySelector(sel);
                         if (el) el.style.display = "none";
                       }, BAR);
                     });
  
            // Give the app a beat to render then snapshot
            await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
            if (afterShot) await page.screenshot({ path: afterShot });
            return { dismissed: true };
          } catch {
            // try next locator
          }
        }
      }
      return { dismissed: false, reason: "link-not-clickable" };
    } catch (e) {
      return { dismissed: false, reason: e.message };
    }
  }
  