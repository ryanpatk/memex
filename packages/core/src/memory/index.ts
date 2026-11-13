/**
 * @memex/core/memory — an in-memory Repository and made-up demo data, for
 * dev fixture mode, screenshots and tests. Kept off the main entry point so
 * production bundles never carry it.
 */
export { createMemoryRepository } from './repository';
export type { MemoryData, MemoryRepositoryOptions } from './repository';
export { createDemoData } from './demoData';
export { withBulkItems, bulkCountFor } from './bulkData';
