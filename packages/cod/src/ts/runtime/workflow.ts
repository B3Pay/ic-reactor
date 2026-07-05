import { FormContext, methodToFormSchema } from "./form.js"
import type {
  CandidMethodIR,
  CandidProgramIR,
  FormSchemaOptions,
  ProgramWorkflowSchema,
  WorkflowMethodNode,
} from "./types.js"

export function programToWorkflowSchema(
  ir: CandidProgramIR,
  options: FormSchemaOptions = {}
): ProgramWorkflowSchema {
  const context = new FormContext(ir, options)
  return {
    nodes: ir.service.methods.map((method) =>
      methodToWorkflowNode(method, context)
    ),
  }
}

export function methodToWorkflowNode(
  method: CandidMethodIR,
  context: FormContext
): WorkflowMethodNode {
  const form = methodToFormSchema(method, context)
  const node: WorkflowMethodNode = {
    id: method.name,
    type: "canister_method",
    methodName: method.name,
    mode: method.mode,
    title: method.name,
    inputs: form.args,
    outputs: form.returns,
  }
  const description = docText(method.docs)
  if (description) {
    node.description = description
  }
  return node
}

function docText(docs: readonly string[] | undefined): string | undefined {
  return docs && docs.length > 0 ? docs.join("\n") : undefined
}
