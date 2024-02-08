import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface ToDo {
  'id' : bigint,
  'completed' : boolean,
  'description' : string,
}
export type ToDos = Array<ToDo>;
export interface _SERVICE {
  'addTodo' : ActorMethod<[string], bigint>,
  'clearComplete' : ActorMethod<[], undefined>,
  'getAllTodos' : ActorMethod<[], [] | [ToDos]>,
  'showTodoAsTuple' : ActorMethod<[], Array<[bigint, string, boolean]>>,
  'toggleTodo' : ActorMethod<[bigint], boolean>,
}
export declare const idlFactory: IDL.InterfaceFactory;
