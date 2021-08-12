import { ChromeClient, FirefoxClient } from "../../mod.ts";
const ScreenshotsFolder = "."+((Deno.build.os == "windows")?'\\':'/')+"Screenshots";

try {
  Deno.removeSync(ScreenshotsFolder, { recursive: true });
} catch (e) {
  console.log((e as Error).message);
} finally {
  Deno.mkdirSync(ScreenshotsFolder);
}

Deno.test("Chrome - Tutorial for taking screenshots in the docs should work", async () => {
  const Sinco = await ChromeClient.build();
  await Sinco.goTo("https://chromestatus.com");
  Sinco.setScreenshotsFolder(ScreenshotsFolder);
  await Sinco.takeScreenshot();
  await Sinco.takeScreenshot({ fileName: "FirstSpanChrome", selector: "span" });
  await Sinco.done();
});

Deno.test("Firefox - Tutorial for taking screenshots in the docs should work", async () => {
  const Sinco = await FirefoxClient.build();
  await Sinco.goTo("https://chromestatus.com");
  Sinco.setScreenshotsFolder(ScreenshotsFolder);
  await Sinco.takeScreenshot();
  await Sinco.takeScreenshot({
    fileName: "FirstSpanFirefox",
    selector: "span",
  });
  await Sinco.done();
  Deno.removeSync(ScreenshotsFolder, { recursive: true });
});