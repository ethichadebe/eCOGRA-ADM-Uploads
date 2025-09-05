// src/automation/loginProbe.js
import { chromium } from "playwright";
import path from "path";

/**
 * loginProbe
 * Hardcoded login flow for ADM portal.
 * Inputs: { username, password }, runDir
 * Output: { ok, currentUrl, title, beforePath, afterPath, reason?, errorText? }
 */
export async function loginProbe({ username, password }, runDir) {
  // ---- Hardcoded targets (URL + selectors) ----
  const LOGIN_URL =
    "https://iampe.adm.gov.it/sam/UI/Login?realm=/adm&locale=en";
  const USER_INPUT = "#userName1";     // <input name="IDToken1">
  const PASS_INPUT = "#userPassword1"; // <input name="IDToken2">
  const SUBMIT_BTN = "button.adm-btn-primary"; // wrapped by <a href="#"><button>Sign in</button></a>

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const result = {
    ok: false,
    currentUrl: "",
    title: "",
    beforePath: path.join(runDir, "00_login_page.png"),
    afterPath: path.join(runDir, "01_after_submit.png")
  };

  try {
    // 1) Go to login page
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Sanity: ensure inputs are present
    await page.waitForSelector(USER_INPUT, { timeout: 15000 });
    await page.waitForSelector(PASS_INPUT, { timeout: 15000 });

    // Snapshot before filling
    await page.screenshot({ path: result.beforePath });

    // 2) Fill credentials
    await page.fill(USER_INPUT, username);
    await page.fill(PASS_INPUT, password);

    // 3) Submit
    // Their markup uses <a><button>Sign in</button></a>. Clicking the button usually triggers form submit.
    await page.click(SUBMIT_BTN, { timeout: 10000 });

    // 4) Wait for either:
    //    - redirect off the /Login page (success guess),
    //    - OR an error indicator (failure).
    const loginLeftPage = page.waitForURL(
      (url) => !String(url).includes("/Login"),
      { timeout: 20000 }
    ).then(() => "SUCCESS")
     .catch(() => null);

    const errorAppeared = page.waitForSelector(
      // try a few common classes used on this site or frameworks
      ".alert, .alert-danger, .alert-warning, .feedbackPanelERROR, .text-danger",
      { timeout: 20000 }
    ).then(() => "ERROR")
     .catch(() => null);

    const outcome = await Promise.race([loginLeftPage, errorAppeared]);

    // Always snapshot after submit
    await page.screenshot({ path: result.afterPath });

    // Fill final context
    result.currentUrl = page.url();
    result.title = await page.title();

    if (outcome === "SUCCESS" || !result.currentUrl.includes("/Login")) {
      result.ok = true;
      return result;
    }

    // If we saw an error container, try to capture its text
    const errorLocator = page.locator(
      ".alert, .alert-danger, .alert-warning, .feedbackPanelERROR, .text-danger"
    );
    if (await errorLocator.count()) {
      const text = (await errorLocator.first().innerText()).trim();
      result.reason = "LOGIN_ERROR";
      result.errorText = text;
      return result;
    }

    // Fallback: still on /Login with no explicit error block
    result.reason = "STILL_ON_LOGIN";
    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}
