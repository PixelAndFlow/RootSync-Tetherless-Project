import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const candidates = [
  process.env.ANDROID_SDK_ROOT,
  process.env.ANDROID_HOME,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
].filter(Boolean);
const sdkRoot = candidates.find((candidate) => existsSync(candidate));

if (!sdkRoot) {
  console.log("Android SDK not detected. Install Android Studio, then install the Android Emulator, Platform Tools, and API 29/30/31 system images through SDK Manager.");
  process.exit(0);
}

const executable = (folder, name) => join(sdkRoot, folder, process.platform === "win32" ? `${name}.exe` : name);
const emulator = executable("emulator", "emulator");
const adb = executable("platform-tools", "adb");
const sdkmanager = executable(join("cmdline-tools", "latest", "bin"), "sdkmanager");

console.log(`Android SDK: ${sdkRoot}`);
console.log(`Emulator: ${existsSync(emulator) ? "ready" : "missing"}`);
console.log(`Platform Tools (adb): ${existsSync(adb) ? "ready" : "missing"}`);
console.log(`SDK Manager: ${existsSync(sdkmanager) ? "ready" : "missing"}`);

if (!existsSync(emulator)) {
  console.log("Next step: Android Studio -> SDK Manager -> SDK Tools -> Android Emulator.");
  process.exit(0);
}

const avds = spawnSync(emulator, ["-list-avds"], { encoding: "utf8" });
const names = (avds.stdout ?? "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
console.log(names.length ? `Configured AVDs: ${names.join(", ")}` : "No AVDs configured yet. Create RCO-Android10-2GB, RCO-Android11-Go, and RCO-Android12-3GB in Device Manager.");
