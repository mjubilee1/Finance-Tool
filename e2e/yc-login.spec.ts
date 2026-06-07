import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

const YC_ACCOUNT_URL = "https://account.ycombinator.com/";
const YC_BOOKFACE_URL = "https://bookface.ycombinator.com/";
const authDir = path.join(__dirname, ".auth");
const authFile = path.join(authDir, "yc-session.json");

function getCredentials() {
  const email = process.env.YC_EMAIL || process.env.YC_USERNAME;
  const password = process.env.YC_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set YC_EMAIL (or YC_USERNAME) and YC_PASSWORD before running the YC login test.",
    );
  }

  return { email, password };
}

async function loginToYCombinator(page: import("@playwright/test").Page) {
  const { email, password } = getCredentials();

  await page.goto(YC_ACCOUNT_URL, { waitUntil: "domcontentloaded" });

  await page.getByLabel(/username or email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();

  await page.waitForLoadState("networkidle");

  const currentUrl = page.url();
  expect(currentUrl).not.toContain("/login");

  const stillOnLoginForm = await page
    .getByRole("button", { name: /^log in$/i })
    .isVisible()
    .catch(() => false);

  expect(stillOnLoginForm).toBe(false);
}

test.describe("Y Combinator login", () => {
  test("logs into YC account and reaches Bookface", async ({ page, context }) => {
    await loginToYCombinator(page);

    await page.goto(YC_BOOKFACE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const pageUrl = page.url();
    const pageText = (await page.locator("body").innerText()).toLowerCase();

    expect(pageUrl).toMatch(/ycombinator\.com/);
    expect(pageText).not.toContain("bookface access is only for yc founders");
    expect(
      pageText.includes("welcome to bookface") &&
        pageText.includes("private community for y combinator founders"),
    ).toBe(false);

    if (process.env.YC_SAVE_SESSION === "true") {
      fs.mkdirSync(authDir, { recursive: true });
      await context.storageState({ path: authFile });
    }
  });
});
