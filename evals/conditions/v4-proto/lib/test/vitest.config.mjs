import { fileURLToPath } from "node:url"
const harness = fileURLToPath(new URL("../../../../harness", import.meta.url))
export default {
  resolve: {
    alias: [{ find: /^#harness\/(.*)$/, replacement: `${harness}/$1` }],
  },
  test: { include: ["lib/test/*.test.ts"], testTimeout: 30000 },
}
