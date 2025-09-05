// src/automation/helpers/selectProvider.js

/**
 * Selects a provider and *waits* for the JSF partial update.
 * We confirm the update by:
 *  - waiting for a POST to the same page (mojarra.ab),
 *  - or for the ViewState to change,
 *  - or for project-type radios ("Piattaforma"/"Gioco") to appear.
 */
export async function selectProvider(page, providerTarget, screenshotPath) {
    const SELECTOR = '#formAcqController\\:elencoConc'; // escape the colon
    const select = page.locator(SELECTOR);
  
    // 1) Ensure the dropdown is visible/enabled
    const visible = await select.isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) return { ok: false, reason: "provider-select-not-visible" };
  
    // 2) Snapshot current ViewState (JSF partials will change this)
    const viewStateSel = 'input[name="javax.faces.ViewState"]';
    const hasVS = await page.locator(viewStateSel).count().catch(() => 0);
    const beforeVS = hasVS ? await page.locator(viewStateSel).inputValue().catch(() => "") : "";
  
    // 3) Collect options and find a match
    const options = await select.locator('option').all();
    const entries = [];
    for (const opt of options) {
      const value = (await opt.getAttribute('value')) ?? '';
      const label = (await opt.textContent())?.trim() ?? '';
      entries.push({ value, label });
    }
  
    const target = (providerTarget || '').trim();
    if (!target) return { ok: false, reason: "empty-target" };
  
    let match = entries.find(o => o.value === target && o.value !== '');
    if (!match) {
      const t = target.toLowerCase();
      match = entries.find(o => o.label.toLowerCase().includes(t));
    }
    if (!match) return { ok: false, reason: "no-match-found" };
  
    // 4) Perform the selection + *ensure a true 'change' event fires*
    await select.selectOption({ value: match.value }).catch(async () => {
      await select.selectOption({ label: match.label });
    });
    // Some JSF setups need an explicit change event
    await page.dispatchEvent(SELECTOR, 'change').catch(() => {});
  
    // 5) Wait for the JSF ajax cycle
    //    (a) wait for a POST to the same page, or
    //    (b) wait for the ViewState to change, or
    //    (c) wait for project-type radios to appear.
    const waiters = [];
  
    // (a) Ajax request to this page (method POST)
    waiters.push(
      page.waitForResponse(
        (resp) => {
          const u = resp.url();
          const isThisPage = /acquisizioneCertificazione\.xhtml/i.test(u);
          return isThisPage && resp.request().method() === 'POST';
        },
        { timeout: 12000 }
      ).catch(() => null)
    );
  
    // (b) ViewState changes
    if (beforeVS) {
      waiters.push(
        page.waitForFunction(
          (sel, prev) => {
            const el = document.querySelector(sel);
            return el && el.value && el.value !== prev;
          },
          viewStateSel,
          beforeVS,
          { timeout: 12000 }
        ).catch(() => null)
      );
    }
  
    // (c) Radios or section text appear
    waiters.push(
      page.locator('input[type="radio"][name*="tipoProgetto"]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => null)
    );
    waiters.push(
      page.locator('text=Selezionare un tipo di progetto').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => null)
    );
  
    // Race the waiters; any one is enough
    await Promise.race(waiters).catch(() => {});
  
    // Small settle time
    await page.waitForTimeout(300);
  
    if (screenshotPath) await page.screenshot({ path: screenshotPath });
  
    // Final verification — is anything interactive visible now?
    const radiosVisible = await page.locator('input[type="radio"][name*="tipoProgetto"]').count().catch(() => 0);
    const textVisible = await page.locator('text=Selezionare un tipo di progetto').count().catch(() => 0);
    const vsAfter = hasVS ? await page.locator(viewStateSel).inputValue().catch(() => beforeVS) : beforeVS;
    const vsChanged = beforeVS && vsAfter && beforeVS !== vsAfter;
  
    if (radiosVisible > 0 || textVisible > 0 || vsChanged) {
      return { ok: true, selectedValue: match.value, selectedLabel: match.label };
    }
  
    return { ok: false, reason: "no-jsf-update-detected" };
  }
  