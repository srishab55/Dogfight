/*
 * A small behaviour tree, after game-skills/GameAI/references/behaviour-tree.md.
 *
 * The tree is ticked from the root every AI step. Each node returns
 * SUCCESS (done this tick), FAILURE (can't do it) or RUNNING (needs more
 * ticks). The shape of the tree is the priority logic: a Selector tries its
 * children in order until one doesn't fail; a Sequence runs them in order
 * until one doesn't succeed. Composites remember which child was RUNNING
 * and resume there next tick, so multi-tick actions aren't restarted.
 *
 * Nodes share state through the context's blackboard, never through
 * references to each other. Pure logic, no engine: the Phase 5 server runs it.
 */

export const Status = { Success: 0, Failure: 1, Running: 2 } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface BtNode<C> {
  /** For debugging and tests: which leaf is running. */
  readonly name: string;
  tick(context: C, dt: number): Status;
  /** Forget any remembered progress (a higher-priority branch took over). */
  reset(): void;
}

/** A pure test of the world or blackboard: no side effects. */
export function condition<C>(name: string, test: (context: C) => boolean): BtNode<C> {
  return { name, tick: (context) => (test(context) ? Status.Success : Status.Failure), reset: () => undefined };
}

/** Does something; returns RUNNING until it's finished. */
export function action<C>(name: string, run: (context: C, dt: number) => Status): BtNode<C> {
  return { name, tick: run, reset: () => undefined };
}

/**
 * Logical AND, left to right. Remembers the RUNNING child and resumes it
 * next tick; a FAILURE resets the sequence.
 */
export function sequence<C>(name: string, children: readonly BtNode<C>[]): BtNode<C> {
  let running = 0;
  return {
    name,
    tick(context, dt) {
      while (running < children.length) {
        const status = children[running]!.tick(context, dt);
        if (status === Status.Running) return Status.Running;
        if (status === Status.Failure) {
          running = 0;
          return Status.Failure;
        }
        running++;
      }
      running = 0;
      return Status.Success;
    },
    reset() {
      running = 0;
      for (const child of children) child.reset();
    },
  };
}

/**
 * Logical OR, in priority order: the first child that doesn't fail wins.
 * Unlike the sequence, it re-checks the higher-priority children every tick
 * (a reactive selector), so an emergency interrupts whatever lower branch
 * was running; the interrupted branch is reset.
 */
export function selector<C>(name: string, children: readonly BtNode<C>[]): BtNode<C> {
  let active = -1;
  return {
    name,
    tick(context, dt) {
      for (let i = 0; i < children.length; i++) {
        const status = children[i]!.tick(context, dt);
        if (status === Status.Failure) continue;
        if (active !== i && active >= 0) children[active]?.reset();
        active = status === Status.Running ? i : -1;
        return status;
      }
      if (active >= 0) children[active]?.reset();
      active = -1;
      return Status.Failure;
    },
    reset() {
      active = -1;
      for (const child of children) child.reset();
    },
  };
}

/**
 * A condition re-checked every tick, guarding its child: a Sequence of
 * condition + action resumes at the RUNNING action and so would never look
 * at the condition again (an emergency that has passed would carry on for
 * ever). When the test fails, the child is reset and the guard fails, so the
 * parent selector moves on.
 */
export function guard<C>(name: string, test: (context: C) => boolean, child: BtNode<C>): BtNode<C> {
  return {
    name,
    tick(context, dt) {
      if (!test(context)) {
        child.reset();
        return Status.Failure;
      }
      return child.tick(context, dt);
    },
    reset: () => child.reset(),
  };
}

/**
 * Time-limits its child: once it has been RUNNING for longer than `seconds`
 * without a break, it is reset and the timeout fails (`onTimeout` can clear
 * what the child left on the blackboard). Keeps a pilot from being stuck in
 * a branch that can't finish. `clock` reads the time from the context.
 */
export function timeout<C>(seconds: number, clock: (context: C) => number, child: BtNode<C>, onTimeout?: (context: C) => void): BtNode<C> {
  let startedAt: number | null = null;
  return {
    name: `timeout ${child.name}`,
    tick(context, dt) {
      const now = clock(context);
      startedAt ??= now;
      if (now - startedAt > seconds) {
        startedAt = null;
        child.reset();
        onTimeout?.(context);
        return Status.Failure;
      }
      const status = child.tick(context, dt);
      if (status !== Status.Running) startedAt = null;
      return status;
    },
    reset() {
      startedAt = null;
      child.reset();
    },
  };
}

/** Swaps SUCCESS and FAILURE; RUNNING passes through. */
export function inverter<C>(child: BtNode<C>): BtNode<C> {
  return {
    name: `not ${child.name}`,
    tick(context, dt) {
      const status = child.tick(context, dt);
      return status === Status.Running ? status : status === Status.Success ? Status.Failure : Status.Success;
    },
    reset: () => child.reset(),
  };
}

/**
 * Lets its child start only once every `seconds`: after the child finishes
 * (SUCCESS or FAILURE), it fails until the cooldown has passed. `clock`
 * reads the time from the context, so the tree stays deterministic.
 */
export function cooldown<C>(seconds: number, clock: (context: C) => number, child: BtNode<C>): BtNode<C> {
  let readyAt = -Infinity;
  let running = false;
  return {
    name: `cooldown ${child.name}`,
    tick(context, dt) {
      const now = clock(context);
      if (!running && now < readyAt) return Status.Failure;
      const status = child.tick(context, dt);
      running = status === Status.Running;
      if (!running) readyAt = now + seconds;
      return status;
    },
    reset() {
      running = false;
      child.reset();
    },
  };
}
