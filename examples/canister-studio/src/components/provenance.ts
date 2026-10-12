import type { InterfaceSource } from "../interface/types.ts"

const MODULE_LABEL: Readonly<
  Record<Extract<InterfaceSource, { kind: "typed" }>["module"], string>
> = {
  icrc1: "icrc1.ts",
  icp_ledger: "icp_ledger.ts",
  ckbtc_minter: "ckbtc_minter.ts",
}

/** What a source can be trusted for, in one line. */
export function provenanceText(source: InterfaceSource): string {
  switch (source.kind) {
    case "typed":
      return `A committed .did, generated at build time into src/canisters/${MODULE_LABEL[source.module]}: its methods have TypeScript types.`
    case "metadata":
      return "The canister's candid:service metadata, read with a certified read_state: the subnet signed it."
    case "tmp_hack":
      return "No metadata: read from the __get_candid_interface_tmp_hack query, one replica's answer that nobody certified. The canister could be lying about its interface."
    case "pasted":
      return "A .did pasted here: nothing ties it to any canister."
  }
}

/** Where an interface came from, in a few words (the facts table). */
export function provenanceShort(source: InterfaceSource): string {
  switch (source.kind) {
    case "typed":
      return `Committed .did, typed by src/canisters/${MODULE_LABEL[source.module]}`
    case "metadata":
      return "candid:service metadata, certified read_state"
    case "tmp_hack":
      return "__get_candid_interface_tmp_hack query, not certified"
    case "pasted":
      return "Pasted .did"
  }
}
