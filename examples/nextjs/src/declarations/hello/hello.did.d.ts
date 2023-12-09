import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

export interface ToDo { 'completed' : boolean, 'description' : string }
export interface _SERVICE {
  'addTodo' : ActorMethod<[string], bigint>,
  'clearComplete' : ActorMethod<[], undefined>,
  'getAllTodos' : ActorMethod<[], Array<[bigint, ToDo]>>,
  'toggleTodo' : ActorMethod<[bigint], undefined>,
}
