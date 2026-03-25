export type EmulatorPlatform = "android" | "ios" | "web" | "windows";

export const EMULATOR_PLATFORMS: Record<EmulatorPlatform, { label: string; icon: string }> = {
    android: { label: "Android", icon: "Smartphone" },
    ios: { label: "iOS", icon: "Apple" },
    web: { label: "Web", icon: "Globe" },
    windows: { label: "Windows", icon: "Monitor" },
};

export const EMULATOR_CONSTANTS = {
    DEFAULT_WEB_PORT: "3000",
    DEFAULT_ANDROID_VNC_PORT: "6080",
};
