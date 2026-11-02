import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render } from '@testing-library/react-native';
import type { Repository } from '@memex/core';
import { DataProvider } from '../data/DataProvider';
import { createFixtureRepository } from '../data/fixtures/fixtureRepository';
import { ThemeProvider } from '../theme/theme';
import { ToastProvider } from '../ui/Toast';

/** The app's providers over the demo repository (core's in-memory Repository). */
export const NOW = new Date(2026, 10, 1, 12, 0);

export const renderWithData = async (ui: ReactElement, repository: Repository = createFixtureRepository({ now: NOW })) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <DataProvider repository={repository} client="memex-ios/test">
              {children}
            </DataProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  const utils = await render(ui, { wrapper: Wrapper });
  return { ...utils, repository, queryClient };
};
