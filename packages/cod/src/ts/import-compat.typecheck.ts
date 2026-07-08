import { actor, c } from "../ts"

const Account = c.record({
  owner: c.principal(),
  subaccount: c.opt(c.blob()),
})

type Account = c.Infer<typeof Account>

const ForwardRecord = c.record({
  callback: c.lazy(() => ForwardCallback, "ForwardCallback"),
})

type ForwardRecord = c.Infer<typeof ForwardRecord>

const ForwardCallback = c.unsupported<c.CandidFuncReference>(
  "func (text) -> (nat) query"
)

void actor
