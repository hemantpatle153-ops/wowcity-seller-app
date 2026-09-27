import * as Updates from "expo-updates";
import { AppState, Platform } from "react-native";
import { toast } from "@/ui";

let checking = false;

/** Download an over-the-air update in the background and offer to restart (never mid-bill). */
export async function checkForAppUpdate(options: { announceNone?: boolean } = {}) {
  if (Platform.OS === "web" || !Updates.isEnabled || checking) return;
  checking = true;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) {
      if (options.announceNone) toast.info("You have the latest version.");
      return;
    }
    await Updates.fetchUpdateAsync();
    toast.info("An update is ready.", { label: "Restart", onPress: () => void Updates.reloadAsync() });
  } catch {
    // No network or no update server: try again next time.
  } finally {
    checking = false;
  }
}

/** Check on start and whenever the app comes back to the foreground (at most every 30 minutes). */
export function startUpdateChecks() {
  let last = 0;
  const run = () => {
    if (Date.now() - last < 30 * 60 * 1000) return;
    last = Date.now();
    void checkForAppUpdate();
  };
  run();
  const sub = AppState.addEventListener("change", (state) => state === "active" && run());
  return () => sub.remove();
}
