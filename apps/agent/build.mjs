import { build } from "esbuild";
import fs from "node:fs";

const prod = process.env.NODE_ENV === "production";
const serverUrl = process.env.RASED_SERVER_URL ?? "http://localhost:3000";

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist/renderer", { recursive: true });

const common = { bundle: true, sourcemap: !prod, minify: prod, logLevel: "info" };

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main.js",
    platform: "node",
    target: "node22",
    format: "cjs",
    // الموديولز اللي فيها native code بتفضل برّه الـ bundle
    external: ["electron", "uiohook-napi", "get-windows"],
    define: { __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl) },
  }),
  build({
    ...common,
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload.js",
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: ["src/renderer/app.tsx"],
    outfile: "dist/renderer/app.js",
    platform: "browser",
    target: "chrome130",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development") },
  }),
]);

fs.copyFileSync("src/renderer/index.html", "dist/renderer/index.html");
fs.copyFileSync("src/renderer/app.css", "dist/renderer/app.css");
