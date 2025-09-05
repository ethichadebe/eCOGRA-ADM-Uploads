// src/automation/uploadSelectProvider.js
import { chromium } from "playwright";
import path from "path";
import { dismissCookies } from "./helpers/dismissCookies.js";
import { waitForDashboard } from "./helpers/waitForDashboard.js";
import { selectProvider } from "./helpers/selectProvider.js";

/**
 * Full flow to reach the upload page and pick the first provider.
 *
 * Inputs body: { username, password, provider: string[] }
 * Uses provider[0] as the selection target.
 */
export async function uploadSelectProvider({ username, password, provider }, runDir) {
  const LOGIN_URL = "https://iampe.adm.gov.it/sam/UI/Login?realm=/adm&locale=en";
  const USER_INPUT = "#userName1";
  const PASS_INPUT = "#userPassword1";
  const SUBMIT_BTN = "button.adm-btn-primary";

  const SSO_JUMP = "https://sso.adm.gov.it/pud2odv?Location=https://odv.adm.gov.it/ODV_OHP/";
  const UPLOAD_PAGE = "https://odv.adm.gov.it/ODV_GAD/pages/acquisizioneCertificazione.xhtml";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const shots = {
    login: path.join(runDir, "00_login_page.png"),
    afterSubmit: path.join(runDir, "01_after_submit.png"),
    afterCookies: path.join(runDir, "02_after_cookies.png"),
    afterSSO: path.join(runDir, "03_after_sso.png"),
    onUpload: path.join(runDir, "04_upload_page.png"),
    afterSelect: path.join(runDir, "05_after_provider_select.png")
  };

  const res = {
    ok: false,
    url: "",
    title: "",
    shots,
    providerTarget: Array.isArray(provider) ? (provider[0] ?? "") : ""
  };

  try {
    // 1) Login
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(USER_INPUT, { timeout: 15000 });
    await page.waitForSelector(PASS_INPUT, { timeout: 15000 });
    await page.screenshot({ path: shots.login });

    await page.fill(USER_INPUT, username);
    await page.fill(PASS_INPUT, password);
    await page.click(SUBMIT_BTN, { timeout: 10000 });

    const leftLogin = await page
      .waitForURL(u => !String(u).includes("/Login"), { timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    await page.screenshot({ path: shots.afterSubmit });
    if (!leftLogin) { res.reason = "login-failed-or-stuck"; return res; }

    // 2) Cookies
    const dc = await dismissCookies(page, shots.afterCookies);
    res.cookieDismissed = dc.dismissed;
    res.cookieDismissReason = dc.reason;

    // 3) SSO jump
    await waitForDashboard(page, 8000).catch(() => {});
    await page.goto(SSO_JUMP, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: shots.afterSSO });

    if (page.url().includes("/Login")) { res.reason = "sso-redirected-to-login"; return res; }

    // 4) Upload page
    await page.goto(UPLOAD_PAGE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: shots.onUpload });

    res.url = page.url();
    res.title = await page.title();

    if (!/\/ODV_GAD\/pages\/acquisizioneCertificazione\.xhtml/i.test(res.url)) {
      res.reason = "upload-page-not-reached";
      return res;
    }

    // 5) Select provider (from provider[0])
    if (!res.providerTarget) {
      res.reason = "no-provider-given";
      return res;
    }

    const pick = await selectProvider(page, res.providerTarget, shots.afterSelect);
    res.providerSelect = pick;
    if (!pick.ok) {
      res.reason = `provider-select-failed: ${pick.reason || "unknown"}`;
      return res;
    }

    // success
    res.ok = true;
    return res;

  } finally {
    await context.close();
    await browser.close();
  }
}
