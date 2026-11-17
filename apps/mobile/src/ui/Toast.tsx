import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useCards } from '../cards/useCards';

/*
 * The toast (web: FeedbackToast; Memory Cards s08, m08): one short message
 * at a time above the composer or the tab bar, with at most one action
 * ("Undo"). It's announced to VoiceOver politely and stays up for the Undo
 * window.
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

const ToastHost = ({ toast, bottom, onAction }: { toast: ToastState | null; bottom: number; onAction: () => void }) =>
  toast ? <CardsToast toast={toast} bottom={bottom} onAction={onAction} /> : null;

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
  message: { flex: 1, paddingVertical: 6 },
  host: { justifyContent: 'flex-end', paddingHorizontal: 12 },
});
