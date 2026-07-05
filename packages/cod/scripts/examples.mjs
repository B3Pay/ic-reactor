#!/usr/bin/env node
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import * as esbuild from "esbuild";

const root = resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const port = readPort(process.argv.slice(2));
const openPath = readOpenPath(process.argv.slice(2));
const shouldOpen = !args.has("--no-open") && process.env.CI !== "true";
const shouldBuild = !args.has("--no-build");
const shouldWatch = !args.has("--no-watch");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".did": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
};

let icrcContext;

if (shouldBuild) {
  await run("npm", ["run", "build:wasm"]);
  await run("npm", ["run", "build:ts"]);
}

if (shouldWatch) {
  icrcContext = await esbuild.context({
    entryPoints: [join(root, "examples/icrc/src/app.js")],
    bundle: true,
    format: "esm",
    outfile: join(root, "examples/icrc/dist/app.js"),
    sourcemap: true,
  });
  await icrcContext.watch();
} else {
  await esbuild.build({
    entryPoints: [join(root, "examples/icrc/src/app.js")],
    bundle: true,
    format: "esm",
    outfile: join(root, "examples/icrc/dist/app.js"),
    sourcemap: true,
  });
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveRequestPath(request.url ?? "/");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    const code = error?.code === "ENOENT" || error?.code === "EISDIR" ? 404 : 500;
    response.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
    response.end(code === 404 ? "Not found\n" : `${error?.message ?? error}\n`);
  }
});

await new Promise((resolveServer, rejectServer) => {
  server.once("error", rejectServer);
  server.listen(port, "127.0.0.1", () => {
    server.off("error", rejectServer);
    resolveServer();
  });
});

const baseUrl = `http://127.0.0.1:${port}`;
console.log("");
console.log("cod examples are live:");
console.log(`  Hub:                  ${baseUrl}/examples/`);
console.log(`  TypeScript playground:${baseUrl}/examples/playground/`);
console.log(`  Candid workbench:     ${baseUrl}/examples/gui/`);
console.log(`  ICRC workbench:       ${baseUrl}/examples/icrc/`);
console.log("");
console.log("Use Ctrl+C to stop the server.");

if (shouldOpen) {
  openUrl(`${baseUrl}${openPath}`);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function resolveRequestPath(rawUrl) {
  const url = new URL(rawUrl, "http://local.examples");
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    pathname = "/examples/";
  }

  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, normalizedPath);
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith("..") || relativePath === "") {
    throw Object.assign(new Error("Invalid path"), { code: "ENOENT" });
  }

  const fileStat = await stat(filePath);
  if (fileStat.isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  return filePath;
}

function readPort(argv) {
  const portArg = argv.find((arg) => arg.startsWith("--port="));
  const value = Number(portArg?.slice("--port=".length) ?? process.env.PORT ?? 4173);

  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`Invalid port: ${portArg}`);
  }

  return value;
}

function readOpenPath(argv) {
  const pathArg = argv.find((arg) => arg.startsWith("--open-path="));
  const value = pathArg?.slice("--open-path=".length) ?? "/examples/";

  if (!value.startsWith("/") || value.includes("..")) {
    throw new Error(`Invalid open path: ${value}`);
  }

  return value;
}

function run(command, commandArgs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} ${commandArgs.join(" ")} failed with ${signal ?? code}`));
      }
    });
  });
}

function openUrl(url) {
  const command =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" :
    "xdg-open";

  const openArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, openArgs, {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32",
  });
  child.unref();
}

async function shutdown() {
  server.close();
  await icrcContext?.dispose();
  process.exit(0);
}
