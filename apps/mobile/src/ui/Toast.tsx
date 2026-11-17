import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/theme';
import { Text } from './Text';
import { useCards } from '../cards/useCards';

/*
 * The toast (web: FeedbackToast): one short message at a time above the
 * composer, with at most one action ("Undo", "Open"). It's announced to
 * VoiceOver politely and stays up for the Undo window. Paper on the canvas,
 * the action an object in the accent.
 */

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
  tone: 'info' | 'error';
  /** The disc's colour (a space's, when something was filed there). */
  accent?: string;
}

interface ToastApi {
  show: (message: string, options?: { action?: ToastAction; tone?: 'info' | 'error'; durationMs?: number; accent?: string }) => void;
  hide: () => void;
  /** How far above the screen's bottom edge toasts sit (screens with a composer lift them over it). */
  setInset: (bottom: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const TOAST_MS = 6000;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [inset, setInset] = useState(96);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setToast({ id: seq.current, message, action: options.action, tone: options.tone ?? 'info', accent: options.accent });
    AccessibilityInfo.announceForAccessibility(options.action ? `${message} ${options.action.label} available.` : message);
    timer.current = setTimeout(() => setToast(null), options.durationMs ?? TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo(() => ({ show, hide, setInset }), [show, hide]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toast={toast} bottom={inset} onAction={hide} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs <ToastProvider>');
  return api;
};

const ToastHost = ({ toast, bottom, onAction }: { toast: ToastState | null; bottom: number; onAction: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  if (!toast) return null;
  if (t.cards) return <CardsToast toast={toast} bottom={bottom} onAction={onAction} />;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, { paddingBottom: bottom }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(140)}
        style={[
          styles.toast,
          {
            backgroundColor: palette.dark ? palette.paper : palette.ink,
            borderRadius: t.radius.l,
            boxShadow: t.paperShadow('m'),
          },
        ]}
        accessibilityLiveRegion="polite"
        testID="toast"
      >
        <Text
          size="s"
          weight="medium"
          style={[styles.message, { color: toast.tone === 'error' ? (palette.dark ? palette.error : '#ffb4a8') : palette.dark ? palette.ink : palette.paper }]}
        >
          {toast.message}
        </Text>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={8}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toast.action?.onPress();
              onAction();
            }}
            style={({ pressed }) => [styles.action, { backgroundColor: pressed ? palette.accent : 'transparent' }]}
          >
            {({ pressed }) => (
              <Text size="s" weight="heavy" style={{ color: pressed ? palette.onAccent : palette.dark ? palette.accentText : palette.bubble }}>
                {toast.action?.label}
              </Text>
            )}
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
};

/**
 * Memory Cards (s08, m08): a dark pill with a coloured disc (a tick, or “!”
 * for an error, which turns the pill red) and the action in a lighter pill.
 */
const CardsToast = ({ toast, bottom, onAction }: { toast: ToastState; bottom: number; onAction: () => void }) => {
  const c = useCards();
  const error = toast.tone === 'error';
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, { paddingBottom: bottom }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(140)}
        style={[styles.cardsToast, { backgroundColor: error ? c.colors.error : c.colors.toast, boxShadow: c.menuShadow }]}
        accessibilityLiveRegion="polite"
        testID="toast"
      >
        <View style={[styles.disc, { backgroundColor: error ? '#ffffff' : (toast.accent ?? c.colors.ok) }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {error ? (
            <RNText style={[c.type.label, { color: c.colors.error, fontFamily: 'Nunito_900Black' }]}>!</RNText>
          ) : (
            <Check size={18} color={toast.accent ? c.colors.onColor : '#ffffff'} strokeWidth={3.25} />
          )}
        </View>
        <RNText style={[c.type.title, styles.message, { fontSize: 17, lineHeight: 22, color: '#ffffff' }]}>{toast.message}</RNText>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={6}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toast.action?.onPress();
              onAction();
            }}
            style={({ pressed }) => [styles.cardsAction, { backgroundColor: pressed ? '#ffffff40' : '#ffffff29' }]}
          >
            <RNText style={[c.type.title, { fontSize: 17, color: '#ffffff' }]}>{toast.action.label}</RNText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardsToast: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderRadius: 30, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardsAction: { minHeight: 44, minWidth: 64, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  host: { justifyContent: 'flex-end', paddingHorizontal: 12 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, minHeight: 48 },
  message: { flex: 1, paddingVertical: 6 },
  action: { minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
