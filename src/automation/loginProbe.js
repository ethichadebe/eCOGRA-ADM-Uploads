import { chromium } from "playwright";
import path from "path";
import { dismissCookies } from "./helpers/dismissCookies.js";
import { waitForDashboard } from "./helpers/waitForDashboard.js";

export async function loginProbe({ username, password }, runDir) {
  const LOGIN_URL = "https://iampe.adm.gov.it/sam/UI/Login?realm=/adm&locale=en";
  const USER_INPUT = "#userName1";
  const PASS_INPUT = "#userPassword1";
  const SUBMIT_BTN = "button.adm-btn-primary";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const result = {
    ok: false,
    currentUrl: "",
    title: "",
    beforePath: path.join(runDir, "00_login_page.png"),
    afterPath: path.join(runDir, "01_after_submit.png"),
    cookiesPath: path.join(runDir, "02_after_cookies.png"),
    debugBlankPath: path.join(runDir, "03_blank_after_cookies.png") // if needed
  };

  try {
    // --- login ---
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(USER_INPUT, { timeout: 15000 });
    await page.waitForSelector(PASS_INPUT, { timeout: 15000 });
    await page.screenshot({ path: result.beforePath });

    await page.fill(USER_INPUT, username);
    await page.fill(PASS_INPUT, password);
    await page.click(SUBMIT_BTN, { timeout: 10000 });

    // success vs error race
    const leftLogin = page.waitForURL(u => !String(u).includes("/Login"), { timeout: 20000 }).then(() => true).catch(() => false);
    const sawError = page.waitForSelector(".alert, .alert-danger, .alert-warning, .feedbackPanelERROR, .text-danger", { timeout: 20000 })
                        .then(() => true).catch(() => false);
    const okLogin = await Promise.race([leftLogin, sawError.then(v => !v)]); // true if leftLogin first

    await page.screenshot({ path: result.afterPath });
    result.currentUrl = page.url();
    result.title = await page.title();

    if (!okLogin && result.currentUrl.includes("/Login")) {
      // capture any visible error
      const errLoc = page.locator(".alert, .alert-danger, .alert-warning, .feedbackPanelERROR, .text-danger");
      if (await errLoc.count()) result.errorText = (await errLoc.first().innerText()).trim();
      result.reason = "LOGIN_ERROR_OR_STUCK";
      return result;
    }

    // --- dismiss cookies (awaited) ---
    const dc = await dismissCookies(page, result.cookiesPath);
    result.cookieDismissed = dc.dismissed;
    if (!dc.dismissed && dc.reason) result.cookieDismissReason = dc.reason;

    // --- wait for dashboard ---
    let ready = await waitForDashboard(page, 12000);
    if (!ready) {
      // one safe reload then re-check
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      ready = await waitForDashboard(page, 8000);
    }

    if (!ready) {
      await page.screenshot({ path: result.debugBlankPath });
      result.reason = "DASHBOARD_NOT_READY";
      result.currentUrl = page.url();
      result.title = await page.title();
      return result;
    }

    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}
