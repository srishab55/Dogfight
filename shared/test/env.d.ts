// Tests run in Node, but the shared tsconfig deliberately has no DOM or Node
// types, so production code can't use platform globals. Tests may log.
declare const console: { log(...values: unknown[]): void };
