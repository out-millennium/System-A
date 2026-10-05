import { test, expect } from "@playwright/test";

const routes = ["/", "/about", "/architecture", "/documents", "/transparency", "/login", "/register", "/policy"];

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test.describe(`${viewport.name} responsive public UI`, () => {
    test.use({ viewport });

    for (const route of routes) {
      test(`${route} has no horizontal overflow or unnamed controls`, async ({ page }) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(350);

        const audit = await page.evaluate(() => {
          const visible = (element: Element) => {
            const node = element as HTMLElement;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const name = (element: Element) =>
            (element.getAttribute("aria-label") || element.textContent || element.getAttribute("title") || "")
              .replace(/\s+/g, " ")
              .trim();
          const unnamed = [...document.querySelectorAll("a,button,[role=button]")]
            .filter(visible)
            .filter((element) => !name(element))
            .map((element) => element.outerHTML.slice(0, 160));
          const badLinks = [...document.querySelectorAll("a")]
            .filter(visible)
            .filter((element) => !element.getAttribute("href") || element.getAttribute("href") === "#")
            .map((element) => name(element));
          const unlabeledInputs = [...document.querySelectorAll("input,select,textarea")]
            .filter(visible)
            .filter((element) => {
              const id = element.id;
              const hasLabel = Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || Boolean(element.closest("label"));
              return !hasLabel && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby");
            })
            .map((element) => element.outerHTML.slice(0, 160));
          return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            unnamed,
            badLinks,
            unlabeledInputs,
            smoothDocument: [document.documentElement, document.body].some((element) => getComputedStyle(element).scrollBehavior === "smooth"),
            introSmooth: Boolean(document.querySelector(".sa-intro-root .scroll-smooth")),
          };
        });

        expect(audit.scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(audit.innerWidth + 1);
        expect(audit.unnamed, `unnamed controls on ${route}`).toEqual([]);
        expect(audit.badLinks, `placeholder links on ${route}`).toEqual([]);
        expect(audit.unlabeledInputs, `unlabeled inputs on ${route}`).toEqual([]);
        expect(audit.smoothDocument || route !== "/", `document scrolling is not smooth on ${route}`).toBeTruthy();
        expect(consoleErrors, `console errors on ${route}`).toEqual([]);
        expect(pageErrors, `page errors on ${route}`).toEqual([]);
      });
    }
  });
}

test("first-visit introduction exposes language control and skip affordance", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("sa_intro_seen");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const intro = page.locator(".sa-intro-root");
  if (await intro.isVisible().catch(() => false)) {
    await expect(intro.getByRole("button", { name: /skip|пропустить|omitir|passer|跳过/i })).toBeVisible();
    await expect(intro.getByRole("button", { name: /language|язык|langue|idioma|语言/i })).toBeVisible();
    await expect(intro.locator(".sa-intro-grid")).toBeVisible();
  }
});
