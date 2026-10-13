import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const failures = [];
try {
  for (const width of [360, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    page.on("pageerror", (error) => failures.push(error.message));
    for (const route of [
      "/",
      "/shop",
      "/cart",
      "/checkout",
      "/account",
      "/about",
      "/faq",
      "/contact",
      "/policies/returns",
      "/products/future-product",
      "/admin",
    ]) {
      await page.goto("http://127.0.0.1:5173" + route);
      await page.locator("h1,h2").first().waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${route} overflow at ${width}`,
      );
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute("content"),
        "noindex,nofollow",
      );
    }
    await page.goto("http://127.0.0.1:5173");
    if (width < 700) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page
        .locator("nav")
        .getByRole("link", { name: "The collection" })
        .click();
      assert.equal(new URL(page.url()).pathname, "/shop");
    }
    await page.goto("http://127.0.0.1:5173/shop");
    await page.getByRole("button", { name: "treat", exact: true }).click();
    await page
      .getByRole("heading", {
        name: "A little patience. A thoughtful collection.",
      })
      .waitFor();
    const closed = await page.request.post(
      "http://127.0.0.1:5173/api/checkout",
      { data: { storeId: "revid", amount: 1 } },
    );
    assert.equal(closed.status(), 409);
    await page.goto("http://127.0.0.1:5173");
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `docs/preview-${width}.png`,
        fullPage: true,
      });
    await page.close();
    console.log(
      `Passed ${width}px: 11 routes, overflow, menu, empty filters, noindex, closed checkout`,
    );
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
