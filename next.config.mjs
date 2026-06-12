import os from "os";
import fs from "fs";
import path from "path";

const getLocalIps = () => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
};

// Read Android (Tauri) version
let androidVersion = "0.0.0";
try {
  const tauriConfPath = path.join(process.cwd(), "src-tauri/tauri.conf.json");
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  androidVersion = tauriConf.version || "0.0.0";
} catch (e) {
  console.error("Failed to read tauri.conf.json version:", e);
}

// Read iOS version from Info.plist
let iosVersion = "0.0.0";
try {
  const plistPath = path.join(process.cwd(), "src-tauri/gen/apple/app_iOS/Info.plist");
  const content = fs.readFileSync(plistPath, "utf8");
  const match = content.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  if (match) {
    iosVersion = match[1];
  }
} catch (e) {
  console.error("Failed to read iOS Info.plist version:", e);
}

// Read Web version from package.json
let webVersion = "0.0.0";
try {
  const pkgPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  webVersion = pkg.version || "0.0.0";
} catch (e) {
  console.error("Failed to read package.json version:", e);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: "export",
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [...getLocalIps(), "localhost"],
  env: {
    NEXT_PUBLIC_ANDROID_VERSION: androidVersion,
    NEXT_PUBLIC_IOS_VERSION: iosVersion,
    NEXT_PUBLIC_WEB_VERSION: webVersion,
  },
};

export default nextConfig;

