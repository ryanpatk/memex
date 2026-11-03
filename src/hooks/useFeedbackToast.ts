import { useCallback, useEffect, useRef, useState } from 'react'
import type { FeedbackToastPhase } from '../components/ui'
import { toastShown } from '../utils/notices'

const TOAST_VISIBLE_MS = 3400
const ACTION_TOAST_VISIBLE_MS = 6000

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastState {
  message: string
  phase: FeedbackToastPhase
  action?: ToastAction
}

/**
 * Timing/phase state machine for the bottom-right FeedbackToast:
 * flash() shows optimistically, auto-exits after a beat, and the
 * animation-end handler finalizes removal (instant under reduced motion).
 * Toasts from different owners (the page, the sidebar, the shell's
 * fallback for failed writes) share that corner, so showing one dismisses
 * the others: the latest message wins.
 */
export function useFeedbackToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [owner] = useState(() => Symbol('toast'))

  const dismiss = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setToast((current) => (current ? { ...current, phase: 'exiting' } : null))
    window.setTimeout(() => {
      setToast((current) => (current?.phase === 'exiting' ? null : current))
    }, 240)
  }, [])

  const flash = useCallback((message: string, action?: ToastAction) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }

    setToast({ message, phase: 'entering', action })
    toastShown.publish(owner)

    hideTimerRef.current = setTimeout(() => {
      setToast((current) => (current ? { ...current, phase: 'exiting' } : null))
      hideTimerRef.current = null

      window.setTimeout(() => {
        setToast((current) => (current?.phase === 'exiting' ? null : current))
      }, 240)
    }, action ? ACTION_TOAST_VISIBLE_MS : TOAST_VISIBLE_MS)
  }, [owner])

  // Another owner's toast took the corner
  useEffect(
    () =>
      toastShown.subscribe((shown) => {
        if (shown !== owner) dismiss()
      }),
    [dismiss, owner],
  )

  const handleAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) return
      if (event.animationName !== 'bookmark-bulk-feedback-out') return
      setToast((current) => (current?.phase === 'exiting' ? null : current))
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  return { toast, flash, dismiss, handleAnimationEnd }
}
