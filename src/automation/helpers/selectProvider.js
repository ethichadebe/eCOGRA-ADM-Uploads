// src/automation/helpers/selectProvider.js

/**
 * Selects a "Concessionario" from the dropdown on
 * /ODV_GAD/pages/acquisizioneCertificazione.xhtml
 *
 * We accept a provider target (string) and try:
 *   1) exact match by <option value="..."> (numbers like "15215")
 *   2) case-insensitive substring match on option label/text
 *
 * @param {import('playwright').Page} page
 * @param {string} providerTarget - e.g. "15215" or "SNAITECH"
 * @param {string} screenshotPath - where to save a screenshot after selection (optional)
 * @returns {Promise<{ok: boolean, selectedValue?: string, selectedLabel?: string, reason?: string}>}
 */
export async function selectProvider(page, providerTarget, screenshotPath) {
    const SELECTOR = '#formAcqController\\:elencoConc'; // note: escape the colon
    const select = page.locator(SELECTOR);
  
    // Ensure the select exists and is enabled
    const visible = await select.isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) return { ok: false, reason: "provider-select-not-visible" };
  
    // Gather all options (value + label)
    const options = await select.locator('option').all();
    const entries = [];
    for (const opt of options) {
      const value = (await opt.getAttribute('value')) ?? '';
      const label = (await opt.textContent())?.trim() ?? '';
      entries.push({ value, label });
    }
  
    // Normalize the target
    const target = (providerTarget || '').trim();
    if (!target) return { ok: false, reason: "empty-target" };
  
    // Strategy 1: exact value match (e.g., "15215")
    let match = entries.find(o => o.value === target && o.value !== '');
    // Strategy 2: case-insensitive substring in the label
    if (!match) {
      const t = target.toLowerCase();
      match = entries.find(o => o.label.toLowerCase().includes(t));
    }
    if (!match) return { ok: false, reason: "no-match-found" };
  
    // Perform selection. JSF onChange does an ajax submit (mojarra.ab),
    // so we wait for network to settle after selection.
    await select.selectOption({ value: match.value }).catch(async () => {
      // if value selection fails (e.g., duplicate empty values), fall back to label
      await select.selectOption({ label: match.label });
    });
  
    // Wait for JSF ajax round-trip to complete
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  
    if (screenshotPath) await page.screenshot({ path: screenshotPath });
  
    return { ok: true, selectedValue: match.value, selectedLabel: match.label };
  }
  