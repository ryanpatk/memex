/*
 * Failed writes always say something (src/Providers.tsx installs the
 * fallback). The rule:
 *
 *   Every mutation that fails shows the shell's generic toast, unless the
 *   mutation's `meta.handlesErrors` is true.
 *
 * A call site that reports its own failure (a toast with specifics, an inline
 * status, text put back in the box) opts out by passing HANDLES_ERRORS to the
 * mutation hook it calls, e.g. `useCreateTask(HANDLES_ERRORS)`. The opt-out is
 * per hook instance, so a component only opts out for the hooks whose every
 * use it handles. A per-call `onError` or a try/catch around `mutateAsync`
 * does not opt out by itself: React Query can't see either from the cache.
 */

export interface MutationMeta extends Record<string, unknown> {
  /** The caller shows its own message when this mutation fails. */
  handlesErrors?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationMeta;
  }
}

export interface MutationHookOptions {
  /** The caller shows its own message on failure (see the rule above). */
  handlesErrors?: boolean;
}

export const HANDLES_ERRORS: MutationHookOptions = { handlesErrors: true };

/** The `meta` a mutation hook passes to useMutation. */
export const errorMeta = (options?: MutationHookOptions): MutationMeta | undefined =>
  options?.handlesErrors ? { handlesErrors: true } : undefined;

/** Whether the global fallback should report a failed mutation with this meta. */
export const shouldReportMutationError = (meta: Readonly<Record<string, unknown>> | undefined): boolean =>
  meta?.handlesErrors !== true;

export const MUTATION_ERROR_MESSAGE = 'Couldn’t save that change. Check your connection and try again.';
export const OFFLINE_MUTATION_ERROR_MESSAGE = 'You’re offline, so that change didn’t save. Try again once you’re back online.';

export const mutationErrorMessage = (online: boolean): string =>
  online ? MUTATION_ERROR_MESSAGE : OFFLINE_MUTATION_ERROR_MESSAGE;
