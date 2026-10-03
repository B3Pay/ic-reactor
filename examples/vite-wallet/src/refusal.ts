// What the backend's `Refusal` (the `Err` of its writes) means, in a sentence.
import type { Refusal } from "./canisters/backend.ts"

export function describeRefusal(refusal: Refusal): string {
  switch (refusal.tag) {
    case "Anonymous":
      return "the anonymous principal owns nothing here."
    case "InvalidName":
      return `${refusal.value}.`
    case "DuplicateName":
      return `"${refusal.value}" is in the address book already.`
    case "NotFound":
      return `no contact is named "${refusal.value}".`
    case "Full":
      return `the address book holds at most ${refusal.value} contacts.`
  }
}
