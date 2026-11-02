import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useSession } from '../auth/SessionProvider';
import { useJournal } from '../data/useJournal';
import { useEntryActions } from '../journal/useEntryActions';
import { ShareSheet } from '../share/ShareSheet';
import { shareDraft } from '../share/shareDraft';
import { payloadFromIntent, payloadFromParams, recentSpaces, sharedFrom } from '../share/shareModel';
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
  const params = useLocalSearchParams<{ url?: string; text?: string; title?: string }>();
  const intent = useShareIntentContext();
  const draft = useSyncExternalStore(shareDraft.subscribe, shareDraft.get);
  const { journal } = useJournal();
  const actions = useEntryActions();

  // Take what arrived (the extension's item wins over link params) and let the native module forget it.
  useEffect(() => {
    if (intent.hasShareIntent) {
      shareDraft.set(payloadFromIntent(intent.shareIntent));
      intent.resetShareIntent();
    } else if (params.url || params.text) {
      shareDraft.set(payloadFromParams(params));
    }
  }, [intent, params]);

  const content = useMemo(() => (draft ? sharedFrom(draft) : null), [draft]);
  const spaces = useMemo(() => (journal ? recentSpaces(journal.spaces, journal.entries) : []), [journal]);

  const close = () => {
    shareDraft.clear();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

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
    <View style={[styles.fill, { backgroundColor: palette.canvas }]}>
      <ShareSheet
        // A new share replaces the sheet's fields.
        key={`${draft?.url ?? ''}|${draft?.text ?? ''}`}
        content={content}
        spaces={spaces}
        signedIn={Boolean(session)}
        onClose={close}
        onSignIn={() => router.replace('/sign-in')}
        onSave={async (result) => {
          const where = result.spaces.map((s) => `“${s.name}”`).join(', ');
          await actions.compose(result, { savedMessage: where ? `Saved, filed in ${where}.` : 'Saved to your Journal.' });
          close();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
