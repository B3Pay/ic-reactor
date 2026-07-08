import { FormContext, methodToFormSchema } from "./form.js"
import type {
  FormSchemaOptions,
  MethodId,
  ProgramIR,
  ProgramWorkflowSchema,
  WorkflowMethodNode,
} from "./types.js"

export function programToWorkflowSchema(
  ir: ProgramIR,
  options: FormSchemaOptions = {}
): ProgramWorkflowSchema {
  const context = new FormContext(ir, options)
  return {
    nodes: context.graph
      .actorMethodIds()
      .map((methodId) => methodToWorkflowNode(methodId, context)),
  }
}

export function methodToWorkflowNode(
  methodId: MethodId,
  context: FormContext
): WorkflowMethodNode {
  const method = context.graph.method(methodId)
  const form = methodToFormSchema(methodId, context)
  const node: WorkflowMethodNode = {
    id: `method:${methodId}`,
    type: "canister_method",
    methodId,
    methodName: method.name,
    mode: method.mode,
    title: method.name,
    inputs: form.args,
    outputs: form.returns,
  }
  const description = docText(method.metadata?.docs)
  if (description) {
    node.description = description
  }
  return node
}

function docText(docs: readonly string[] | undefined): string | undefined {
  return docs && docs.length > 0 ? docs.join("\n") : undefined
}
