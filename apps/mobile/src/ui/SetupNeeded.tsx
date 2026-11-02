import { StyleSheet, View } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import { Canvas } from './Canvas';
import { Placeholder } from './Placeholder';
import { Wordmark } from './Wordmark';

/** Shown when apps/mobile/.env is missing its Supabase settings (dev builds only, in practice). */
export const SetupNeeded = () => (
  <Canvas>
    <View style={styles.center}>
      <Wordmark />
      <Placeholder
        icon={<Settings2 size={26} color="#ffffff" strokeWidth={2} />}
        title="Supabase isn’t configured"
        body="Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env (see .env.example), then restart Expo."
      />
    </View>
  </Canvas>
);

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center', gap: 25, alignItems: 'center' } });
