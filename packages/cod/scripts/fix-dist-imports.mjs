import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const files = ["dist/index.js", "dist/index.d.ts"];
const sourceImport = "../../pkg/cod_core.js";
const packageImport = "../pkg/cod_core.js";

for (const file of files) {
  const path = resolve(file);
  const contents = readFileSync(path, "utf8");

  if (!contents.includes(sourceImport)) {
    throw new Error(`${file} does not contain ${sourceImport}`);
  }

  writeFileSync(path, contents.replaceAll(sourceImport, packageImport));
}
