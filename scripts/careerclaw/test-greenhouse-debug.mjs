import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const RESUME_PATH = join(ROOT, "gv_resume.pdf");

async function pickReactSelect(page, el, { search = "", matchFn = null } = {}) {
  try {
    if ((await el.count()) === 0) {
      console.log("  el not found");
      return false;
    }
    await el.click({ timeout: 3000 });
    await page.waitForTimeout(300);
    if (search) {
      await el.evaluate((node) => {
        node.value = "";
      });
      await el.type(search, { delay: 25 });
      await page.waitForTimeout(600);
    } else {
      await page.waitForTimeout(400);
    }
    // Use more specific selector: options inside an open menu
    const opts = page.locator('[class*="select__option"]:not([class*="selected"])');
    const count = await opts.count();
    console.log("  Options found:", count);
    const texts = await opts.allTextContents().catch(() => []);
    texts.slice(0, 5).forEach((t) => console.log("   opt:", JSON.stringify(t)));
    if (!count) {
      await page.keyboard.press("Enter");
      return true;
    }
    if (matchFn) {
      for (let i = 0; i < count; i++) {
        const t = (await opts.nth(i).textContent()) || "";
        console.log("  checking:", JSON.stringify(t), "match:", matchFn(t));
        if (matchFn(t)) {
          await opts.nth(i).click();
          console.log("  -> clicked");
          return true;
        }
      }
      console.log("  -> no match found, clicking first");
    }
    await opts.first().click();
    return true;
  } catch (e) {
    console.log("  ERROR:", e.message.slice(0, 100));
    return false;
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
});

await page.goto("https://job-boards.greenhouse.io/twilio/jobs/7610326", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(1500);
await page
  .locator('a:has-text("Apply")')
  .first()
  .click()
  .catch(() => {});
try {
  await page.locator("#first_name").waitFor({ timeout: 10000 });
} catch {}
await page.waitForTimeout(500);

// Quick fill of basic required fields
await page.locator("#first_name").fill("Guillermo");
await page.locator("#last_name").fill("Villegas");
await page
  .locator("#preferred_name")
  .fill("Guillermo")
  .catch(() => {});
await page.locator("#email").fill("guillermo.villegas.applies@gmail.com");
await page.locator("#phone").fill("(773) 551-1393");
await page
  .locator('#resume[type="file"]')
  .setInputFiles(RESUME_PATH)
  .catch(() => {});
const tmpCl = "/tmp/cl-test.txt";
writeFileSync(tmpCl, "Test cover letter");
await page
  .locator('#cover_letter[type="file"]')
  .setInputFiles(tmpCl)
  .catch(() => {});
await page
  .locator("#question_63429456")
  .fill("https://www.linkedin.com/in/guillermo-villegas-3080a011b")
  .catch(() => {});

// Fill country
console.log("=== country ===");
await pickReactSelect(page, page.locator('[id="country"]').first(), { search: "United States" });

// Fill location
console.log("=== candidate-location ===");
await pickReactSelect(page, page.locator('[id="candidate-location"]').first(), {
  search: "Chicago",
});

// Work auth
console.log("=== question_63429458 (work auth) ===");
await pickReactSelect(page, page.locator('[id="question_63429458"]').first(), {
  matchFn: (t) => /^yes\b/i.test(t.trim()),
});

// Sponsor
console.log("=== question_63429459 (sponsor) ===");
await pickReactSelect(page, page.locator('[id="question_63429459"]').first(), {
  matchFn: (t) => /^no\b/i.test(t.trim()),
});

// Cuba/countries
console.log("=== question_63429460 (Cuba/countries) ===");
await pickReactSelect(page, page.locator('[id="question_63429460"]').first(), {
  matchFn: (t) => /^no\b/i.test(t.trim()),
});

// Check acknowledge checkboxes
await page
  .locator('[id="question_63429461[]_628045689"]')
  .check()
  .catch(() => {});
await page
  .locator('[id="question_63429462[]_628045690"]')
  .check()
  .catch(() => {});

// EEO fields
const eeoIds = ["1712", "1713", "1714", "1715", "1716"];
for (const id of eeoIds) {
  console.log("=== EEO", id, "===");
  const el = page.locator(`[id="${id}"]`).first();
  await pickReactSelect(page, el, {
    matchFn: (t) => /decline|don.t wish|prefer not|choose not|not to answer|rather not/i.test(t),
  });
}

// GDPR consent
console.log("=== GDPR consent ===");
await page
  .locator('[id="gdpr_demographic_data_consent_given_1"]')
  .check()
  .catch((e) => console.log("GDPR check error:", e.message));

// Submit
const submitBtn = page.locator('button[type="submit"]').last();
await submitBtn.click().catch(() => {});
await page.waitForTimeout(5000);

const errors = await page.locator('[id*="-error"]').all();
const errTexts = [];
for (const e of errors) {
  const t = await e.textContent();
  if (t?.trim()) {
    errTexts.push(t.trim());
  }
}
console.log("\n=== Result ===");
console.log("Errors:", errTexts.length, errTexts);
const body = await page.textContent("body");
console.log("Thank you:", /thank you|application received/i.test(body));
console.log("Verification:", /verification code.*sent|security code/i.test(body));
await page.screenshot({ path: "/tmp/twilio-eeo-test.png" });
await browser.close();
