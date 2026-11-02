import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import type { FlushResult } from '@memex/core';
import { useToast } from '../ui/Toast';
import type { ComposeOutcome } from './actions';
import { useSaves } from './DataProvider';

/*
 * When saves kept on the phone are sent: at launch (once the stored queue is
 * read), whenever the app comes back to the foreground, when the connection
 * comes back, and after each backoff while the app is open. Only the
 * signed-in user's saves go; nothing runs while signed out.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const outboxMessage = (result: FlushResult<ComposeOutcome>) => {
  if (result.failed.length) {
    return { tone: 'error' as const, text: `Couldn’t save ${plural(result.failed.length, 'thing', 'things')} from this phone. Retry or discard in the Journal.` };
  }
  if (result.sent.length) return { tone: 'info' as const, text: `Sent ${plural(result.sent.length, 'save', 'saves')} kept on this phone.` };
  return null;
};

export const useOutboxSync = (owner: string | null) => {
  const saves = useSaves();
  const toast = useToast();

  useEffect(() => {
    saves.setOwner(owner);
  }, [owner, saves]);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const due = saves.outbox.nextDueAt(owner);
      if (alive && due !== null && AppState.currentState !== 'background') {
        timer = setTimeout(() => void run(false), Math.max(1_000, due - Date.now()));
      }
    };

    const run = async (force: boolean) => {
      try {
        const result = await saves.flush(force);
        const message = alive ? outboxMessage(result) : null;
        if (message) {
          void Haptics.notificationAsync(message.tone === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
          toast.show(message.text, { tone: message.tone });
        }
      } catch (error) {
        console.warn('Outbox flush failed:', error);
      } finally {
        schedule();
      }
    };

    void saves.outbox.load().then(() => {
      if (alive) void run(true);
    });
    // A new save in the queue (or a retry's new backoff) moves the timer.
    const queued = saves.outbox.subscribe(schedule);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run(true);
    });
    let offline = false;
    const net = NetInfo.addEventListener((state) => {
      const reachable = state.isConnected !== false && state.isInternetReachable !== false;
      if (reachable && offline) void run(true);
      offline = !reachable;
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      queued();
      app.remove();
      net();
    };
  }, [owner, saves, toast]);
};
