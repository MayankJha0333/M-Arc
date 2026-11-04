import { produce } from 'immer';
import { createInitialState } from '@shared/defaults';
import type { AppState } from '@shared/types';

export const T0 = 1_700_000_000_000;

/** Run a mutation on a state and return the new state + whatever it returned. */
export function run<R>(s: AppState, fn: (d: AppState) => R): [AppState, R] {
  let out!: R;
  const next = produce(s, (d) => {
    out = fn(d as AppState);
  });
  return [next, out];
}

export function fresh(): AppState {
  return createInitialState();
}
