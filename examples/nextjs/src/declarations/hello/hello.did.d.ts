import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

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
  'toggleTodo' : ActorMethod<[bigint], boolean>,
}
