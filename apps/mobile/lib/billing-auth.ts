import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type BillingAuthModule = { open(url: string): Promise<void> };

/**
 * Opens checkout in Chrome's Auth Tab on Android. Resolves false when this binary has no
 * module or the browser cannot host an Auth Tab, so the caller can use the older browser.
 */
export async function openAndroidBillingAuth(url: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const module = requireNativeModule<BillingAuthModule>("AlmaBillingAuth");
    await module.open(url);
    return true;
  } catch {
    return false;
  }
}
