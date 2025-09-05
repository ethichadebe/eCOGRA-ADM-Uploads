// src/automation/navToUploadPage.js
import { chromium } from "playwright";
import path from "path";
import { dismissCookies } from "./helpers/dismissCookies.js";
import { waitForDashboard } from "./helpers/waitForDashboard.js";

/**
 * Logs in to ADM, closes cookie bar, navigates through SSO to the ODV area,
 * then lands on the "Acquisizione Certificazione" page (upload start).
 *
 * Inputs:
 *   { username, password }, runDir
 *
 * Output (JSON-friendly):
 *   {
 *     ok: boolean,
 *     reason?: string,
 *     url: string,
 *     title: string,
 *     shots: { ...paths }
 *   }
 */
export async function navToUploadPage({ username, password }, runDir) {
  // --- Hardcoded paths you provided ---
  const LOGIN_URL = "https://iampe.adm.gov.it/sam/UI/Login?realm=/adm&locale=en";
  const USER_INPUT = "#userName1";     // <input name="IDToken1">
  const PASS_INPUT = "#userPassword1"; // <input name="IDToken2">
  const SUBMIT_BTN = "button.adm-btn-primary";

  const SSO_JUMP = "https://sso.adm.gov.it/pud2odv?Location=https://odv.adm.gov.it/ODV_OHP/";
  const UPLOAD_PAGE = "https://odv.adm.gov.it/ODV_GAD/pages/acquisizioneCertificazione.xhtml";

  // Known-good signals on the final page (best-effort; we’ll verify URL first)
  const FINAL_PROBES = [
    'h1:has-text("Acquisizione Certificazione")',
    'form[action*="acquisizioneCertificazione"]',
    'button:has-text("Carica")',
    'button:has-text("Upload")'
  ];

  // --- Browser context ---
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  // Where we’ll save artifacts
  const shots = {
    login: path.join(runDir, "00_login_page.png"),
    afterSubmit: path.join(runDir, "01_after_submit.png"),
    afterCookies: path.join(runDir, "02_after_cookies.png"),
    ssoLanded: path.join(runDir, "03_after_sso.png"),
    uploadLanded: path.join(runDir, "04_upload_page.png"),
    debug: path.join(runDir, "04_debug.png"),
  };

  const res = { ok: false, url: "", title: "", shots };

  try {
    // ---------- 1) Login ----------
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(USER_INPUT, { timeout: 15_000 });
    await page.waitForSelector(PASS_INPUT, { timeout: 15_000 });
    await page.screenshot({ path: shots.login });

    await page.fill(USER_INPUT, username);
    await page.fill(PASS_INPUT, password);
    await page.click(SUBMIT_BTN, { timeout: 10_000 });

    const leftLogin = await page
      .waitForURL(u => !String(u).includes("/Login"), { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    await page.screenshot({ path: shots.afterSubmit });

    if (!leftLogin) {
      res.reason = "login-failed-or-stuck";
      res.url = page.url();
      res.title = await page.title();
      return res;
    }

    // ---------- 2) Cookies ----------
    const dc = await dismissCookies(page, shots.afterCookies);
    res.cookieDismissed = dc.dismissed;
    res.cookieDismissReason = dc.reason;

    // Optional: ensure post-login shell rendered before we jump
    await waitForDashboard(page, 10_000).catch(() => {});

    // ---------- 3) Navigate to SSO jump ----------
    await page.goto(SSO_JUMP, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Allow for redirects + network quiet
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.screenshot({ path: shots.ssoLanded });

    // Sometimes SSO bounces you back to login if the session isn't recognized.
    if (page.url().includes("/Login")) {
      res.reason = "sso-redirected-to-login";
      res.url = page.url();
      res.title = await page.title();
      return res;
    }

    // ---------- 4) Navigate to the upload page ----------
    await page.goto(UPLOAD_PAGE, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    // Verify by URL first
    res.url = page.url();
    res.title = await page.title();

    const onRightUrl = /\/ODV_GAD\/pages\/acquisizioneCertificazione\.xhtml(\b|$)/i.test(res.url);

    // Probe for content/controls (best-effort)
    let contentOk = false;
    for (const probe of FINAL_PROBES) {
      const count = await page.locator(probe).count().catch(() => 0);
      if (count) { contentOk = true; break; }
    }

    if (onRightUrl || contentOk) {
      await page.screenshot({ path: shots.uploadLanded });
      res.ok = true;
      return res;
    }

    // Not convincing: leave a debug screenshot and surface a reason
    await page.screenshot({ path: shots.debug });
    res.reason = "upload-page-not-ready";
    return res;

  } finally {
    await context.close();
    await browser.close();
  }
}
