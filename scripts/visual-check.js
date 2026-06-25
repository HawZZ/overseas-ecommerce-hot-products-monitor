import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const reportsDir = path.resolve("reports");
const visualUsername = process.env.DASHBOARD_USERNAME;
const visualPassword = process.env.DASHBOARD_PASSWORD;
const baseUrl = process.env.VISUAL_BASE_URL || "http://127.0.0.1:5173/";
const viewports = [
  { name: "desktop", width: 1440, height: 980 },
  { name: "mobile", width: 390, height: 844 }
];

if (!visualUsername || !visualPassword) {
  console.error("DASHBOARD_USERNAME and DASHBOARD_PASSWORD are required for visual checks.");
  process.exit(1);
}

await fs.mkdir(reportsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport: {
      width: viewport.width,
      height: viewport.height
    }
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("input[autocomplete='username']").fill(visualUsername);
  await page.locator("input[autocomplete='current-password']").fill(visualPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.locator(".product-group").first().waitFor({ state: "visible", timeout: 60000 });
  await page.locator(".chart-frame svg").first().waitFor({ state: "visible", timeout: 60000 });

  const title = await page.locator(".brand-line").innerText();
  const productRows = await page.locator(".product-group").count();
  const svgCount = await page.locator(".chart-frame svg").count();
  const overflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    return [...document.querySelectorAll("body *")].some((element) => {
      if (element.closest(".product-table")) return false;
      const rect = element.getBoundingClientRect();
      return rect.right > viewportWidth + 2 || rect.left < -2;
    });
  });
  const screenshot = path.join(reportsDir, `${viewport.name}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  await page.close();

  results.push({
    viewport,
    title,
    productRows,
    svgCount,
    overflow,
    errors,
    screenshot
  });
}

await browser.close();

console.log(JSON.stringify(results, null, 2));

const failed = results.some((result) => result.productRows < 1 || result.svgCount < 1 || result.overflow || result.errors.length > 0);
if (failed) {
  process.exit(1);
}
