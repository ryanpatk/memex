import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useSession } from '../auth/SessionProvider';
import { FIXTURE_MODE } from '../data/config';
import type { Composed } from '../data/actions';
import { useJournal } from '../data/useJournal';
import { useEntryActions } from '../journal/useEntryActions';
import { ShareSheet } from '../share/ShareSheet';
import { shareDraft } from '../share/shareDraft';
import { payloadFromIntent, payloadFromParams, recentSpaces, sharedFrom, shareResult } from '../share/shareModel';
import { useTheme } from '../theme/theme';
import { Text } from '../ui/Text';

/*
 * The share sheet's screen (presented as a sheet; see _layout). What you
 * shared comes from the share extension (expo-share-intent's native module)
 * or from `memex://share?url=…&text=…&title=…`. It's kept in shareDraft until
 * you save or close, so signing in first doesn't lose it.
 */
export default function ShareScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { session, ready } = useSession();
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string; send?: string }>();
  const intent = useShareIntentContext();
  const draft = useSyncExternalStore(shareDraft.subscribe, shareDraft.get);
  const { journal } = useJournal();
  const actions = useEntryActions();

  // Take what arrived (the extension's item wins over link params) and let the native module forget it.
  // Link params are taken once: after Save or Close they're still in the URL and mustn't refill the sheet.
  const taken = useRef<string | null>(null);
  useEffect(() => {
    if (intent.hasShareIntent) {
      shareDraft.set(payloadFromIntent(intent.shareIntent));
      intent.resetShareIntent();
    } else if (params.url || params.text) {
      const key = JSON.stringify([params.url, params.text, params.title]);
      if (taken.current === key) return;
      taken.current = key;
      shareDraft.set(payloadFromParams(params));
    }
  }, [intent, params]);

  // If nothing arrives (the extension's item was already taken), say so rather than spin.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (draft) return;
    const timer = setTimeout(() => setGaveUp(true), 4000);
    return () => clearTimeout(timer);
  }, [draft]);

  const content = useMemo(() => (draft ? sharedFrom(draft) : gaveUp ? ({ kind: 'empty' } as const) : null), [draft, gaveUp]);
  const spaces = useMemo(() => (journal ? recentSpaces(journal.spaces, journal.entries) : []), [journal]);

  const close = () => {
    shareDraft.clear();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const save = async (result: Composed) => {
    const where = result.spaces.map((s) => `“${s.name}”`).join(', ');
    await actions.compose(result, { savedMessage: where ? `Saved, filed in ${where}.` : 'Saved to your Journal.' });
    close();
  };

  // DEV-ONLY, demo data only: `&send=1` presses Save, so the simulator (which
  // can't be tapped from scripts) can prove the save path. Like the Journal's.
  const sent = useRef(false);
  useEffect(() => {
    if (!__DEV__ || FIXTURE_MODE === 'off' || params.send !== '1' || sent.current || !content || !journal || !session) return;
    const result = shareResult(content, content.kind === 'link' ? (content.note ?? '') : content.kind === 'text' ? content.text : '', journal.spaces, null);
    if (!result) return;
    sent.current = true;
    void save(result).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, journal, params.send, session]);

  if (!content || !ready) {
    return (
      <View style={[styles.center, { backgroundColor: palette.canvas }]}>
        <ActivityIndicator color={palette.muted} />
        <Text size="s" tone="muted">
          Getting what you shared…
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.fill, { backgroundColor: palette.canvas }]}>
      <ShareSheet
        // A new share replaces the sheet's fields.
        key={`${draft?.url ?? ''}|${draft?.text ?? ''}`}
        content={content}
        spaces={spaces}
        signedIn={Boolean(session)}
        onClose={close}
        onSignIn={() => router.replace('/sign-in')}
        onSave={save}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
