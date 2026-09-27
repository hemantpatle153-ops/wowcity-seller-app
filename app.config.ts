import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const bundleId = IS_DEV ? "com.luzzan.wowcity.seller.dev" : IS_PREVIEW ? "com.luzzan.wowcity.seller.preview" : "com.luzzan.wowcity.seller";
const name = IS_DEV ? "WowCity Seller (Dev)" : IS_PREVIEW ? "WowCity Seller (Preview)" : "WowCity Seller";

const CAMERA = "WowCity Seller uses the camera to scan product barcodes while billing and to take product photos.";
const PHOTOS = "WowCity Seller uses your photos so you can add product pictures.";
const BLUETOOTH = "WowCity Seller uses Bluetooth to print receipts on your thermal printer.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: "wowcity-seller",
  owner: process.env.EXPO_OWNER || undefined,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "wowcityseller",
  userInterfaceStyle: "automatic",
  runtimeVersion: { policy: "appVersion" },
  // EAS Update: JavaScript-only fixes without a store release (needs EAS_PROJECT_ID from `eas init`).
  updates: process.env.EAS_PROJECT_ID ? { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 } : { enabled: false },
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: true,
    buildNumber: "1",
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: CAMERA,
      NSPhotoLibraryUsageDescription: PHOTOS,
      NSPhotoLibraryAddUsageDescription: "WowCity Seller saves receipts and labels you choose to keep.",
      NSBluetoothAlwaysUsageDescription: BLUETOOTH,
      NSBluetoothPeripheralUsageDescription: BLUETOOTH
    }
  },
  android: {
    package: bundleId,
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#1E5BD8",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png"
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.VIBRATE"
    ],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    predictiveBackGestureEnabled: false
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
    bundler: "metro"
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#1E5BD8", image: "./assets/images/splash-icon.png", imageWidth: 96, dark: { backgroundColor: "#15171A" } }],
    ["expo-camera", { cameraPermission: CAMERA, recordAudioAndroid: false }],
    ["expo-image-picker", { photosPermission: PHOTOS, cameraPermission: CAMERA }],
    "expo-secure-store",
    "expo-sqlite",
    "expo-sharing",
    "expo-localization"
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    router: {},
    eas: { projectId: process.env.EAS_PROJECT_ID || undefined }
  }
});
