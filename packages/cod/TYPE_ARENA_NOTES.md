# Type Arena Notes

The type arena is a data structure that stores all the types used in a program. It is designed to support efficient type checking and type inference, as well as to enable the generation of Candid declarations from the program's types.

## The Laws

1. TypeId identifies a structural type node.
2. DeclId identifies a named Candid declaration.
3. Structural type identity and declaration identity are separate.
4. TypeRefIr preserves whether a type use refers directly to a structural type or through a named declaration.
5. Named references are not TypeKindIr nodes.
6. Recursion is represented through declaration references, never parser Knot IDs or string names.
