import { useCallback, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useToast } from '../ui/Toast';

/** Toasts sit just above the composer, wherever the keyboard has put it; back to the default when the screen leaves. */
export const useComposerToasts = () => {
  const toast = useToast();
  const { height } = useWindowDimensions();
  const composerTop = useRef(height);
  const placeToasts = useCallback(
    (y: number) => {
      composerTop.current = y;
      toast.setInset(Math.max(height - y + 8, 16));
    },
    [height, toast],
  );
  useFocusEffect(
    useCallback(() => {
      placeToasts(composerTop.current);
      return () => toast.setInset(96);
    }, [placeToasts, toast]),
  );
  return placeToasts;
};
