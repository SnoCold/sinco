import { assertEquals } from "../../deps.ts";
/**
 * Other ways you can achieve this are:
 *
 * 1. If you have one page that gives you the token, you can goTo that, then carry on goToing your protected resources, because the cookies will carry over (assuming you've configured the cookies on your end correctly)
 */

import { buildFor } from "../../mod.ts";
import { browserList } from "../browser_list.ts";

for (const browserItem of browserList) {
  Deno.test(browserItem.name, async (t) => {
    await t.step(
      `CSRF Protected Pages - Tutorial for this feature in the docs should work`,
      async () => {
        const { browser, page } = await buildFor(browserItem.name);
        await page.location("https://drash.land");
        await page.cookie({
          name: "X-CSRF-TOKEN",
          value: "hi:)",
          url: "https://drash.land",
        });
        await page.location("https://drash.land/drash/v1.x/#/"); // Going here to ensure the cookie stays
        const cookieVal = await page.evaluate(() => {
          return document.cookie;
        });
        await browser.close();
        assertEquals(cookieVal, "X-CSRF-TOKEN=hi:)");
      },
    );
  });
}
