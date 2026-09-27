import { router, type Href } from "expo-router";
import { appHref } from "./links";

/** Push an app path built at runtime (other areas' routes such as /bills/<id> or /stock/<id>). */
export function openPath(path: string) {
  router.push(path as Href);
}

/** Open a web href from the API when the app has a matching screen. Returns false when it doesn't. */
export function openWebHref(webPath: unknown): boolean {
  const path = appHref(webPath);
  if (!path) return false;
  openPath(path);
  return true;
}
