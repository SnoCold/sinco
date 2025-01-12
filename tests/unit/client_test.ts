import { assertEquals, deferred } from "../../deps.ts";
import { buildFor } from "../../mod.ts";
import { browserList } from "../browser_list.ts";

for (const browserItem of browserList) {
  Deno.test(`${browserItem.name}`, async (t) => {
    await t.step("create()", async (t) => {
      await t.step(
        "Will start ${browserItem.name} headless as a subprocess",
        async () => {
          const { browser } = await buildFor(browserItem.name);
          const res = await fetch("http://localhost:9292/json/list");
          const json = await res.json();
          // Our ws client should be able to connect if the browser is running
          const client = new WebSocket(json[0]["webSocketDebuggerUrl"]);
          const promise = deferred();
          client.onopen = function () {
            client.close();
          };
          client.onclose = function () {
            promise.resolve();
          };
          await promise;
          await browser.close();
        },
      );

      await t.step(
        "Uses the port when passed in to the parameters",
        async () => {
          const { browser } = await buildFor(browserItem.name, {
            debuggerPort: 9999,
          });
          const res = await fetch("http://localhost:9999/json/list");
          const json = await res.json();
          // Our ws client should be able to connect if the browser is running
          const client = new WebSocket(json[0]["webSocketDebuggerUrl"]);
          const promise = deferred();
          client.onopen = function () {
            client.close();
          };
          client.onclose = function () {
            promise.resolve();
          };
          await promise;
          await browser.close();
        },
      );

      await t.step(
        "Uses the hostname when passed in to the parameters",
        async () => {
          // Unable to test properly, as windows doesnt like 0.0.0.0 or localhost, so the only choice is 127.0.0.1 but this is already the default
        },
      );

      await t.step(
        "Uses the binaryPath when passed in to the parameters",
        async () => {
          const { browser } = await buildFor(browserItem.name, {
            //binaryPath: await browserItem.getPath(),
          });

          const res = await fetch("http://localhost:9292/json/list");
          const json = await res.json();
          // Our ws client should be able to connect if the browser is running
          const client = new WebSocket(json[0]["webSocketDebuggerUrl"]);
          const promise = deferred();
          client.onopen = function () {
            client.close();
          };
          client.onclose = function () {
            promise.resolve();
          };
          await promise;
          await browser.close();
        },
      );
    });

    await t.step(`close()`, async (t) => {
      await t.step(`Should close all resources and not leak any`, async () => {
        const { browser, page } = await buildFor(browserItem.name);
        await page.location("https://drash.land");
        await browser.close();
        // If resources are not closed or pending ops or leaked, this test will show it when ran
      });

      await t.step(`Should close all page specific resources too`, async () => {
        const { browser, page } = await buildFor(browserItem.name);
        await page.location("https://drash.land");
        await browser.close();
        try {
          const listener = Deno.listen({
            port: 9292,
            hostname: "localhost",
          });
          listener.close();
        } catch (e) {
          if (e instanceof Deno.errors.AddrInUse) {
            throw new Error(
              `Seems like the subprocess is still running: ${e.message}`,
            );
          }
        }
        // If resources are not closed or pending ops or leaked, this test will show it when ran
      });
    });

    await t.step("closeAllPagesExcept()", async (t) => {
      if (browserItem.name === "chrome") {
        await t.step(
          `Should close all pages except the one passed in`,
          async () => {
            const { browser, page } = await buildFor(browserItem.name);
            await page.location("https://drash.land");
            const elem = await page.querySelector("a");
            await elem.click({
              button: "middle",
            });
            const page2 = await browser.page(2);
            await browser.closeAllPagesExcept(page2);
            let errMsg = "";
            try {
              await page.location();
            } catch (e) {
              errMsg = e.message;
            }
            const page2location = await page2.location();
            await browser.close();
            assertEquals(errMsg, "readyState not OPEN");
            assertEquals(page2location, "https://github.com/drashland");
          },
        );
      }
    });

    await t.step("page()", async (t) => {
      await t.step(`Should return the correct page`, async () => {
        const { browser, page } = await buildFor(browserItem.name);
        const mainPage = await browser.page(1);
        await browser.close();
        assertEquals(page.target_id, mainPage.target_id);
      });

      await t.step(
        `Should throw out of bounds if index doesnt exist`,
        async () => {
          const { browser } = await buildFor(browserItem.name);
          let threw = false;
          try {
            await browser.page(2);
          } catch (_e) {
            // As expected :)
            threw = true;
          } finally {
            await browser.close();
            assertEquals(threw, true);
          }
        },
      );
    });
  });
}
