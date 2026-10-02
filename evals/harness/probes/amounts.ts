// The amount inputs the probes try, one fresh world each. The first seven are
// the inputs refuses_invalid_amount used before the split (node-tool; the
// react-wallet test used three of them); the last two are valid controls.
export const PROBE_AMOUNTS: [string, string][] = [
  ["nine_fraction_digits", "1.123456789"],
  ["nat64_max_plus_one", "184467440737.09551616"],
  ["far_past_nat64", "99999999999999999999"],
  ["negative", "-1"],
  ["letters", "abc"],
  ["empty", ""],
  ["exponent", "1e3"],
  ["control_1.5", "1.5"],
  ["control_nat64_max", "184467440737.09551615"],
]
