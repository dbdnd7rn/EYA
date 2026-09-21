import type { Href, router as expoRouter } from "expo-router";

export function goBackOrFallback(router: typeof expoRouter, fallback: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
