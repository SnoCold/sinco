export interface BuildOptions {
  /** The port that the WebSocket server should run on when starting the headless client */
  debuggerPort?: number;
  /** The hostname that the WebSocket server starts on when starting the headless client */
  hostname?: string;
  /** The path to the binary of the browser executable, such as specifying an alternative chromium browser */
  binaryPath?: string;
}

export interface ScreenshotOptions {
  /** Screenshot the given selector instead of the full page. Optional */
  fileName?: string;
  /** The Screenshot format(and hence extension). Allowed values are "jpeg" and "png" - Optional */
  format?: "jpeg" | "png";
  /** The image quality from 0 to 100, default 80. Applicable only if no format provided or format is "jpeg" - Optional */
  quality?: number;
}

/**
 * Interface that describes a /json/list item for the websocket endpoint
 */
export interface WebsocketTarget {
  /** The page description, cna be "" */
  description: string;
  /** The frontend url we can view for debugging */
  devtoolsFrontendUrl: string;
  /** The target id of the target */
  id: string;
  /** The page title */
  title: string;
  /** The type of target */
  type: "page" | "browser";
  /** The target url */
  url: string;
  /** Websocket url we can connect to */
  webSocketDebuggerUrl: string;
}

export type Cookie = {
  /** The name of the cookie */
  name: string;
  /** The value to set the cookie to */
  value: string;
  /** The domain that the cookie shoudl belong to */
  url: string;
};
