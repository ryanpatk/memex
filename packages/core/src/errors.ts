/** Safe message string for unknown thrown values (Supabase, fetch, etc.). */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') {
      return m;
    }
  }
  return '';
}
