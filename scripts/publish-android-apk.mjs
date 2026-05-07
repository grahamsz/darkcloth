import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(
  root,
  "apps/android/app/build/outputs/apk/release/app-release-unsigned.apk",
);
const downloadsDir = resolve(root, "public/downloads");
const targets = [
  "phototracker-android-v1.0.apk",
  "phototracker.apk",
];

if (!existsSync(source)) {
  throw new Error(
    `Android APK not found at ${source}. Build it before deploying, for example from apps/android with ./gradlew assembleRelease.`,
  );
}

mkdirSync(downloadsDir, { recursive: true });

for (const target of targets) {
  copyFileSync(source, resolve(downloadsDir, target));
}

const apk = readFileSync(source);
const digest = createHash("sha256").update(apk).digest("hex");
const size = statSync(source).size;

console.log(
  `Published Android APK to public/downloads (${size} bytes, sha256 ${digest})`,
);
for (const target of targets) {
  console.log(`- ${target}`);
}
