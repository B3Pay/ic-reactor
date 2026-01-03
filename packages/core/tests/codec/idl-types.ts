import { IDL } from "@icp-sdk/core/candid"

// This module exports the individual IDL types for a Todo Application
// These are test fixtures used for codec testing

export const UUID = IDL.Text

export const TodoActionType = IDL.Variant({
  Create: UUID,
  Update: UUID,
  Delete: UUID,
  Complete: UUID,
  Archive: UUID,
})

export const TodoCategory = IDL.Variant({
  Work: IDL.Null,
  Personal: IDL.Null,
  Home: IDL.Null,
  Urgent: IDL.Null,
})

export const TodoType = IDL.Variant({
  Task: IDL.Null,
  Subtask: UUID,
  List: IDL.Null,
  Action: TodoActionType,
  Category: TodoCategory,
  Note: IDL.Null,
})

export const HexString = IDL.Text

export const Metadata = IDL.Record({ key: IDL.Text, value: IDL.Text })

export const Sha256Hex = IDL.Text

export const TimestampRFC3339 = IDL.Text

export const TodoStatus = IDL.Variant({
  Cancelled: IDL.Opt(IDL.Text),
  InProgress: IDL.Null,
  Completed: IDL.Null,
  Pending: IDL.Null,
})

export const ReviewerDecision = IDL.Variant({
  Approved: IDL.Record({
    signature: HexString,
    comment: IDL.Opt(IDL.Text),
  }),
  Rejected: IDL.Record({ reason: IDL.Opt(IDL.Text) }),
})

export const UserRole = IDL.Variant({
  Admin: IDL.Null,
  Editor: IDL.Null,
  Viewer: IDL.Null,
  Owner: IDL.Null,
  Contributor: IDL.Null,
})

export const ReviewRecord = IDL.Record({
  decision: IDL.Opt(ReviewerDecision),
  decision_at: IDL.Opt(TimestampRFC3339),
  role: UserRole,
  identity: IDL.Opt(IDL.Principal),
})

export const Todo = IDL.Record({
  id: UUID,
  todo_type: TodoType,
  description: IDL.Text,
  metadata: IDL.Vec(Metadata),
  title: IDL.Text,
  content_hash: Sha256Hex,
  priority: IDL.Nat8, // 0-255
  due_date: IDL.Text,
  created_at: TimestampRFC3339,
  created_by: IDL.Principal,
  status: TodoStatus,
  reviews: IDL.Vec(ReviewRecord),
})

// Export all types as a convenient object
export const todoIDLTypes = {
  TodoStatus,
  UserRole,
  Todo,
  Metadata,
  UUID,
  TimestampRFC3339,
  HexString,
  TodoType,
  ReviewRecord,
  ReviewerDecision,
}
