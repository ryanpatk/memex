// Reading every row past PostgREST's row cap (Supabase's API returns at most
// `max_rows` rows per request, 1,000 by default). Without paging a list
// silently stops at the cap: the app would show 1,000 links when there are
// 1,400, and every count built from the list would be wrong with it.

/** Rows asked for per request; the server may return fewer (its own cap). */
export const PAGE_SIZE = 1000

interface PageResult<T> {
  data: T[] | null
  error: unknown
  count?: number | null
}

/**
 * Every row of a query, page by page. `page(from, to)` builds the query for
 * rows `from`…`to` (inclusive, `.range(from, to)`), with an order that ends
 * in a unique column so pages never overlap. The first page asks for the
 * exact count; reading stops once that many rows are in, or a page comes back
 * empty. It works whatever the server's cap is, since it moves on by the
 * number of rows actually returned.
 */
export async function selectAllPages<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    const from = rows.length
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1, from === 0)
    if (error) throw error
    if (from === 0 && typeof count === 'number') total = count
    const got = data ?? []
    rows.push(...got)
    if (got.length === 0) break
    if (total !== null && rows.length >= total) break
    // No count (an old server): a short page is the last one
    if (total === null && got.length < PAGE_SIZE) break
  }
  return rows
}
