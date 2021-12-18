import { assertEquals, deferred, Protocol } from "../deps.ts";
import { existsSync, generateTimestamp } from "./utility.ts";
import { Element } from "./element.ts";
import { Protocol as ProtocolClass } from "./protocol.ts";
import { Cookie, ScreenshotOptions } from "./interfaces.ts";

/**
 * A representation of the page the client is on, allowing the client to action
 * on it, such as setting cookies, or selecting elements, or interacting with localstorage etc
 */
export class Page {
  readonly #protocol: ProtocolClass;

  constructor(protocol: ProtocolClass) {
    this.#protocol = protocol;
  }


  async #connectToPage(){
    await this.#protocol.sendWebSocketMessage("Target.activateTarget", {targetId: this.#protocol.frame_id})
  }

 
  /**
   * Either get all cookies for the page, or set a cookie
   *
   * @param newCookie - Only required if you want to set a cookie
   *
   * @returns All cookies for the page if no parameter is passed in, else an empty array
   */
  public async cookie(
    newCookie?: Cookie,
  ): Promise<Protocol.Network.Cookie[] | []> {
    if (!newCookie) {
      const result = await this.#protocol.sendWebSocketMessage<
        Protocol.Network.GetCookiesRequest,
        Protocol.Network.GetCookiesResponse
      >("Network.getCookies");
      return result.cookies;
    }
    await this.#protocol.sendWebSocketMessage<
      Protocol.Network.SetCookieRequest,
      Protocol.Network.SetCookieResponse
    >("Network.setCookie", {
      name: newCookie.name,
      value: newCookie.value,
      url: newCookie.url,
    });
    return [];
  }

  /**
   * Either get the href/url for the page, or set the location
   *
   * @param newLocation - Only required if you want to set the location
   *
   * @example
   * ```js
   * const location = await page.location() // "https://drash.land"
   * ```
   *
   * @returns The location for the page if no parameter is passed in, else an empty string
   */
  public async location(newLocation?: string): Promise<string> {
    const backupFrameID = this.#protocol.frame_id // This value is getting altered. no Freaking Idea why or how. so I save it
    console.log("Backup ID iss  "+backupFrameID)
    if (!newLocation) {
      const targets = await this.#protocol.sendWebSocketMessage<
        null,
        Protocol.Target.GetTargetsResponse
      >("Target.getTargets");
      this.#protocol.frame_id = backupFrameID //we just need it here, but have to reassign to compensate for auto change
      
      return targets.targetInfos.find((info) => info.targetId === this.#protocol.frame_id)!!.url
      
    }
    await this.#connectToPage()
    const method = "Page.loadEventFired";
    this.#protocol.notification_resolvables.set(method, deferred());
    const notificationPromise = this.#protocol.notification_resolvables.get(
      method,
    );
    const res = await this.#protocol.sendWebSocketMessage<
      Protocol.Page.NavigateRequest,
      Protocol.Page.NavigateResponse
    >(
      "Page.navigate",
      {
        url: newLocation,
      },
    );
    await notificationPromise;
    if (res.errorText) {
      await this.#protocol.done(
        `${res.errorText}: Error for navigating to page "${newLocation}"`,
      );
    }
    this.#protocol.frame_id = backupFrameID //same here
    
    return "";
    
  }

  public async close() {
    if (this.#protocol.browser === "chrome") {
      //Chrome has an endpoint available for closing tabs, so using that
      const urlToClose = "http://" + this.#protocol.socket.url.match(/\/\/([a-zA-z0-9.]*\:\d*)\//)!![1] + "/json/close/" + this.#protocol.frame_id;
      let response = await fetch(urlToClose)
      
      if (response.status !== 200) {
        this.#protocol.done("An error occured on closing the required tab");
      }

    } else {

      // In Firefox, we open the ws to browser process first
      let promise = deferred();
      const newProtocol = new ProtocolClass(
        new WebSocket(this.#protocol.browserWSUrl!!),
        this.#protocol.browser_process,
        this.#protocol.browser,
        this.#protocol.browserWSUrl!!.split("/").pop()!!,
        this.#protocol.firefox_profile_path
      )
      newProtocol.socket.onopen = () => promise.resolve();
      await promise;
      // Then close the tab
      await newProtocol.sendWebSocketMessage("Target.closeTarget",{targetId:this.#protocol.frame_id})

      // And then close ws to be safe
      promise = deferred();
      newProtocol.socket.onclose = () => promise.resolve();
      newProtocol.socket.close()
      await promise;
    }
  }

  /**
   * Invoke a function or string expression on the current frame.
   *
   * @param pageCommand - The function to be called or the line of code to execute.
   *
   * @returns The result of the evaluation
   */
  async evaluate(
    pageCommand: (() => unknown) | string,
    // As defined by the #protocol, the `value` is `any`
    // deno-lint-ignore no-explicit-any
  ): Promise<any> {
    await this.#connectToPage()
    console.error("The FrameID "+ this.#protocol.frame_id + " and ws url "+ this.#protocol.socket.url)
    if (typeof pageCommand === "string") {
      const result = await this.#protocol.sendWebSocketMessage<
        Protocol.Runtime.EvaluateRequest,
        Protocol.Runtime.EvaluateResponse
      >("Runtime.evaluate", {
        expression: pageCommand,
        includeCommandLineAPI: true, // supports things like $x
      });
      await this.#checkForErrorResult(result, pageCommand);
      console.log(result)
      return result.result.value;
    }

    if (typeof pageCommand === "function") {
      const { executionContextId } = await this.#protocol.sendWebSocketMessage<
        Protocol.Page.CreateIsolatedWorldRequest,
        Protocol.Page.CreateIsolatedWorldResponse
      >(
        "Page.createIsolatedWorld",
        {
          frameId: this.#protocol.frame_id,
        },
      );
      console.log("execcontextID " + executionContextId)
      const res = await this.#protocol.sendWebSocketMessage<
        Protocol.Runtime.CallFunctionOnRequest,
        Protocol.Runtime.CallFunctionOnResponse
      >(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: pageCommand.toString(),
          executionContextId: executionContextId,
          returnByValue: true,
          awaitPromise: true,
          userGesture: true,
        },
      );
      await this.#checkForErrorResult(res, pageCommand.toString());
      console.log(res)
      return res.result.value;
    }
  }

  /**
   * Wait for the page to change. Can be used with `click()` if clicking a button or anchor tag that redirects the user
   */
  async waitForPageChange(): Promise<void> {
    await this.#connectToPage()
    const backupFrameID = this.#protocol.frame_id
    const method = "Page.loadEventFired";
    this.#protocol.notification_resolvables.set(method, deferred());
    const notificationPromise = this.#protocol.notification_resolvables.get(
      method,
    );
    await notificationPromise;
    this.#protocol.notification_resolvables.delete(method);
    this.#protocol.frame_id = backupFrameID 
  }

  /**
   * Check if the given text exists on the DOM
   *
   * @param text - The text to check for
   */
  async assertSee(text: string): Promise<void> {
    await this.#connectToPage()
    const command = `document.body.innerText.includes('${text}')`;
    const exists = await this.evaluate(command);
    if (exists !== true) { // We know it's going to fail, so before an assertion error is thrown, cleanupup
      await this.#protocol.done();
    }
    assertEquals(exists, true);
  }

  /**
   * Representation of the Browser's `document.querySelector`
   *
   * @param selector - The selector for the element
   *
   * @returns An element class, allowing you to take an action upon that element
   */
  async querySelector(selector: string) {
    await this.#connectToPage()
    const result = await this.evaluate(
      `document.querySelector('${selector}')`,
    );
    if (result === null) {
      await this.#protocol.done(
        'The selector "' + selector + '" does not exist inside the DOM',
      );
    }
    return new Element("document.querySelector", selector, this);
  }

  /**
   * Take a screenshot of the page and save it to `filename` in `path` folder, with a `format` and `quality` (jpeg format only)
   * If `selector` is passed in, it will take a screenshot of only that element
   * and its children as opposed to the whole page.
   *
   * @param path - The path of where to save the screenshot to
   * @param options
   *
   * @returns The path to the file relative to CWD, e.g., "Screenshots/users/user_1.png"
   */
  async takeScreenshot(
    path: string,
    options?: ScreenshotOptions,
  ): Promise<string> {
    await this.#connectToPage()
    if (!existsSync(path)) {
      await this.#protocol.done();
      throw new Error(`The provided folder path - ${path} doesn't exist`);
    }
    const ext = options?.format ?? "jpeg";
    const rawViewportResult = options?.selector
      ? await this.evaluate(
        `JSON.stringify(document.querySelector('${options.selector}').getBoundingClientRect())`,
      )
      : "{}";
    const jsonViewportResult = JSON.parse(rawViewportResult);
    const viewPort = {
      x: jsonViewportResult.x,
      y: jsonViewportResult.y,
      width: jsonViewportResult.width,
      height: jsonViewportResult.height,
      scale: 2,
    };
    const clip = (options?.selector) ? viewPort : undefined;

    if (options?.quality && Math.abs(options.quality) > 100 && ext == "jpeg") {
      await this.#protocol.done(
        "A quality value greater than 100 is not allowed.",
      );
    }

    //Quality should defined only if format is jpeg
    const quality = (ext == "jpeg")
      ? ((options?.quality) ? Math.abs(options.quality) : 80)
      : undefined;

    const res = await this.#protocol.sendWebSocketMessage<
      Protocol.Page.CaptureScreenshotRequest,
      Protocol.Page.CaptureScreenshotResponse
    >(
      "Page.captureScreenshot",
      {
        format: ext,
        quality: quality,
        clip: clip,
      },
    ) as {
      data: string;
    };

    //Writing the Obtained Base64 encoded string to image file
    const fName = `${path}/${
      options?.fileName?.replaceAll(/.jpeg|.jpg|.png/g, "") ??
        generateTimestamp()
    }.${ext}`;
    const B64str = res.data;
    const u8Arr = Uint8Array.from<string>(atob(B64str), (c) => c.charCodeAt(0));
    try {
      Deno.writeFileSync(fName, u8Arr);
    } catch (e) {
      await this.#protocol.done();
      throw new Error(e.message);
    }

    return fName;
  }

  /**
   * Checks if the result is an error
   *
   * @param result - The DOM result response, after writing to stdin and getting by stdout of the process
   * @param commandSent - The command sent to trigger the result
   */
  async #checkForErrorResult(
    result: Protocol.Runtime.AwaitPromiseResponse,
    commandSent: string,
  ): Promise<void> {
    const exceptionDetail = result.exceptionDetails;
    if (!exceptionDetail) {
      return;
    }
    if (exceptionDetail.text && !exceptionDetail.exception) { // specific for firefox
      await this.#protocol.done(exceptionDetail.text);
    }
    const errorMessage = exceptionDetail.exception!.description ??
      exceptionDetail.text;
    if (errorMessage.includes("SyntaxError")) { // a syntax error
      const message = errorMessage.replace("SyntaxError: ", "");
      await this.#protocol.done();
      throw new SyntaxError(message + ": `" + commandSent + "`");
    }
    // any others, unsure what they'd be
    await this.#protocol.done(`${errorMessage}: "${commandSent}"`);
  }
}
