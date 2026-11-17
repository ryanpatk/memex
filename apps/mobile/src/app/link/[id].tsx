import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Link2Off } from 'lucide-react-native';
import type { Entry } from '@memex/core';
import { LinkPage } from '../../cards/LinkPage';
import { useRepository } from '../../data/DataProvider';
import { useJournal } from '../../data/useJournal';
import { Canvas } from '../../ui/Canvas';
import { FeedError } from '../../ui/FeedStates';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { StackHeader } from '../../ui/StackHeader';
import { useToast } from '../../ui/Toast';

/*
 * A link, open (ROADMAP Phase 6: "link detail; open in browser"; m04): the
 * open card (cards/LinkPage). It's found in the Journal's entries, or loaded
 * on its own when a deep link arrives first; a link that didn't load is not
 * the same as one that's gone.
 */

type LinkEntry = Extract<Entry, { kind: 'link' }>;

export default function LinkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const repository = useRepository();
  const { journal, isLoading, refresh } = useJournal();
  const entry = journal?.entries.find((e): e is LinkEntry => e.kind === 'link' && e.link.id === id);
  // Deep links can arrive before (or without) the Journal's copy. Supabase's
  // .single() answers “no rows” (PGRST116) for a link that's gone: that's null, not an error.
  const fallback = useQuery({
    queryKey: ['link', id],
    queryFn: () =>
      repository.links.getById(id).catch((e: unknown) => {
        if ((e as { code?: unknown } | null)?.code === 'PGRST116') return null;
        throw e;
      }),
    enabled: Boolean(id) && !isLoading && !entry,
  });

  useFocusEffect(
    useCallback(() => {
      toast.setInset(insets.bottom + 16);
      return () => toast.setInset(96);
    }, [insets.bottom, toast]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const link = entry?.link ?? fallback.data ?? null;

  return (
    <Canvas>
      {link ? (
        <LinkPage link={link} entry={entry} spaces={journal?.spaces ?? []} filer={journal?.filer} onBack={back} top={insets.top} bottom={insets.bottom} />
      ) : (
        <>
          <StackHeader onBack={back} />
          {isLoading || fallback.isPending ? null : fallback.isError ? (
            // It didn't load (offline, refused): not the same as gone.
            <FeedError
              error={fallback.error}
              onRetry={() => {
                void fallback.refetch();
                void refresh();
              }}
              title="Couldn’t load this link"
              retrying={fallback.isFetching}
            />
          ) : (
            <Gone onBack={back} />
          )}
        </>
      )}
    </Canvas>
  );
}

const Gone = ({ onBack }: { onBack: () => void }) => (
  <View style={styles.gone}>
    <Placeholder icon={<Link2Off />} title="This link isn’t here anymore" body="It may have been deleted on another device.">
      <Button label="Back" onPress={onBack} />
    </Placeholder>
  </View>
);

const styles = StyleSheet.create({
  gone: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
