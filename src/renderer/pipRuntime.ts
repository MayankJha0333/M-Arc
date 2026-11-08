// Pops playing videos out (or brings them back) automatically.
// Tab switches are handled here. App switches are handled by the main process,
// which must act the instant Kite stops being the active app (on macOS a covered
// window soon counts as hidden), so this file only keeps it told which tabs to try.

import { appSwitchTargets, planOnSwitch, type PipPlan } from '@shared/pip';
import * as ops from '@shared/ops';
import type { AppState, ID } from '@shared/types';
import { getS, getUi, setUi, toast, useKite } from './store';
import { surface } from './surfaces';
import { bridge } from './platform';
import { pipHooks } from './commands';

/** Tabs whose pages are showing right now (one tab, or every pane of a split). */
export function visibleTabs(s: AppState): ID[] {
  const id = ops.activeItemId(s);
  const it = id ? s.items[id] : null;
  if (!it) return [];
  if (it.kind === 'tab') return [it.id];
  if (it.kind === 'split') return [...it.panes];
  return [];
}

async function apply(plan: PipPlan) {
  for (const id of plan.exit) {
    await surface(id)?.returnVideo();
    setUi((u) => ({ pipped: u.pipped.filter((x) => x !== id) }));
  }
  if (plan.enter) {
    const id = plan.enter;
    // Only one floating video at a time: bring back any other we popped out.
    for (const other of getUi().pipped.filter((x) => x !== id)) await surface(other)?.returnVideo();
    const ok = (await surface(id)?.popOutVideo()) ?? false;
    setUi({ pipped: ok ? [id] : [] });
  }
}

let started = false;
let manual: ID | null = null;

export function startPip() {
  if (started) return;
  started = true;
  let before = visibleTabs(getS());
  let focusedBefore = ops.activeTab(getS())?.id ?? null;
  let targets = '';

  const syncTargets = (st: ReturnType<typeof useKite.getState>) => {
    const next = appSwitchTargets(visibleTabs(st.s), st.s.settings, ops.activeTab(st.s)?.id);
    if (next.join('|') !== targets) {
      targets = next.join('|');
      bridge.setPipTargets(next);
    }
  };

  useKite.subscribe((st) => {
    syncTargets(st);
    const after = visibleTabs(st.s);
    const focusedNow = ops.activeTab(st.s)?.id ?? null;
    if (after.join('|') !== before.join('|')) {
      const s = st.s.settings;
      const plan = planOnSwitch(before, after, st.ui.playing, st.ui.pipped, s, focusedBefore);
      const playing = before.filter((id) => st.ui.playing[id]);
      bridge.debugLog(`switch: left [${before}] playing [${playing}] → pop out ${plan.enter ?? 'nothing'}, return [${plan.exit}]`);
      before = after;
      focusedBefore = focusedNow;
      void apply(plan);
    } else {
      focusedBefore = focusedNow;
    }
  });
  syncTargets(useKite.getState());

  bridge.onPipState(({ tabId, popped }) => {
    setUi((u) => ({ pipped: popped ? [tabId] : u.pipped.filter((x) => x !== tabId) }));
  });
}

/** ⌘⇧P: pop the current tab's video out, or bring it back. */
export async function togglePopOut() {
  const tab = ops.activeTab(getS());
  if (!tab) return;
  const h = surface(tab.id);
  if (!h) return;
  if (manual === tab.id || getUi().pipped.includes(tab.id)) {
    await h.returnVideo();
    manual = null;
    setUi((u) => ({ pipped: u.pipped.filter((x) => x !== tab.id) }));
    return;
  }
  if (await h.popOutVideo()) manual = tab.id;
  else toast('No playing video on this page');
}

export function toggleMute(id?: ID) {
  const tabId = id ?? ops.activeTab(getS())?.id;
  if (!tabId) return;
  const muted = !getUi().muted[tabId];
  surface(tabId)?.setMuted(muted);
  setUi((u) => ({ muted: { ...u.muted, [tabId]: muted } }));
}

pipHooks.toggle = togglePopOut;
pipHooks.mute = () => toggleMute();
