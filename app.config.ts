import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const PROJECT_ID = process.env.EAS_PROJECT_ID;

// A store build must know its server: refuse to build one that would silently talk to a guessed URL.
if (process.env.EAS_BUILD_PROFILE === "production" && !process.env.EXPO_PUBLIC_API_URL) {
  throw new Error("Set EXPO_PUBLIC_API_URL for the production profile (EAS → Environment variables) before building.");
}
if (process.env.EAS_BUILD_PROFILE === "production" && process.env.EXPO_PUBLIC_MOCK && process.env.EXPO_PUBLIC_MOCK !== "0") {
  throw new Error("EXPO_PUBLIC_MOCK must be off for production builds.");
}
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const bundleId = IS_DEV ? "com.luzzan.wowcity.seller.dev" : IS_PREVIEW ? "com.luzzan.wowcity.seller.preview" : "com.luzzan.wowcity.seller";
const name = IS_DEV ? "WowCity Seller (Dev)" : IS_PREVIEW ? "WowCity Seller (Preview)" : "WowCity Seller";

const CAMERA = "WowCity Seller uses the camera to scan product barcodes while billing and to take product photos.";
const PHOTOS = "WowCity Seller uses your photos so you can add product pictures.";
const MICROPHONE = "WowCity Seller uses the microphone only when you tap the mic to speak a question to Sarah, the assistant.";
const SPEECH = "WowCity Seller turns what you say to Sarah into text.";
const LOCATION = "WowCity Seller uses your location only when you tap “Use my location” to pin your store on the map for buyers.";
const BLUETOOTH = "WowCity Seller uses Bluetooth to print receipts on your thermal printer.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: "wowcity-seller",
  owner: process.env.EXPO_OWNER || undefined,
  version: "1.0.2",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "wowcityseller",
  userInterfaceStyle: "automatic",
  runtimeVersion: { policy: "appVersion" },
  // EAS Update: JavaScript-only fixes without a store release (needs EAS_PROJECT_ID from `eas init`).
  updates: PROJECT_ID ? { url: `https://u.expo.dev/${PROJECT_ID}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 } : { enabled: false },
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
    },
    // Required-reason APIs used by React Native, AsyncStorage, SQLite and file access (App Store privacy manifest).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime", NSPrivacyAccessedAPITypeReasons: ["35F9.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace", NSPrivacyAccessedAPITypeReasons: ["E174.1"] }
      ]
    }
  },
  android: {
    package: bundleId,
    versionCode: 3,
    adaptiveIcon: {
      backgroundColor: "#FF6A3D",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png"
    },
    permissions: ["android.permission.CAMERA", "android.permission.VIBRATE"],
    // Bluetooth permissions arrive with the Bluetooth printer module (its config plugin adds them with
    // neverForLocation); declaring them now, unused, only draws store-review questions.
    blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.SYSTEM_ALERT_WINDOW"],
    predictiveBackGestureEnabled: false
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
    bundler: "metro"
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#FFFFFF", image: "./assets/images/splash-icon.png", imageWidth: 120, dark: { backgroundColor: "#15171A" } }],
    ["expo-camera", { cameraPermission: CAMERA, recordAudioAndroid: false }],
    ["expo-image-picker", { photosPermission: PHOTOS, cameraPermission: CAMERA }],
    [
      "expo-location",
      {
        locationWhenInUsePermission: LOCATION,
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false
      }
    ],
    "expo-secure-store",
    "expo-sqlite",
    "expo-sharing",
    "expo-localization",
    ["expo-speech-recognition", { microphonePermission: MICROPHONE, speechRecognitionPermission: SPEECH }]
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    router: {},
    eas: { projectId: PROJECT_ID || undefined }
  }
});
