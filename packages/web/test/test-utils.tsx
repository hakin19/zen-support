import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';

// Default mock session data
const defaultSessionUser = {
  id: '1',
  email: 'test@example.com',
  role: 'admin' as const,
  full_name: 'Test User',
};

// Mock useSession hook data
export let mockSessionData = {
  user: defaultSessionUser,
  loading: false,
  error: null,
  refetch: vi.fn().mockResolvedValue(undefined),
};

// Export mock functions to control session state in tests
export const mockUseSession = (
  overrides: Partial<typeof mockSessionData> = {}
) => {
  mockSessionData = { ...mockSessionData, ...overrides };
  return mockSessionData;
};

export const resetSessionMock = () => {
  mockSessionData = {
    user: defaultSessionUser,
    loading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
};

// Simple wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return <div data-testid='test-wrapper'>{children}</div>;
};

// Custom render function
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Future options can be added here
}

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  return render(ui, {
    wrapper: TestWrapper,
    ...options,
  });
};

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };

// Test helper for creating mock users
export const createMockUser = (
  overrides: Partial<{
    id: string;
    email: string;
    role: 'owner' | 'admin' | 'viewer';
    full_name?: string;
  }> = {}
) => ({
  id: '1',
  email: 'test@example.com',
  role: 'admin' as const,
  full_name: 'Test User',
  ...overrides,
});

// Clipboard mock setup function
export const setupClipboardMock = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const readText = vi.fn().mockResolvedValue('');

  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText,
      readText,
    },
    writable: true,
    configurable: true,
  });

  return { writeText, readText };
};

// Common test setup function
export const setupTestEnvironment = () => {
  // Setup clipboard
  const clipboard = setupClipboardMock();

  // Mock window.scrollTo (already in setup.ts, but ensuring it's available)
  if (typeof window !== 'undefined') {
    window.scrollTo = vi.fn();
  }

  return { clipboard };
};
