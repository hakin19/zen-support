import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const isMVP = process.env.TEST_MODE === 'MVP';
const itFull = isMVP ? it.skip : it;
const describeFull = isMVP ? describe.skip : describe;
import { render, screen, waitFor, within } from '../../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PromptTemplateEditor } from './PromptTemplateEditor';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';
// import * as monaco from 'monaco-editor'; // Monaco is mocked

// Mock Monaco Editor - simplified mock to avoid any async issues
vi.mock('monaco-editor', () => ({
  editor: {},
  languages: {},
}));

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn((props: any) => {
    const { value, onChange } = props;
    return (
      <textarea
        data-testid='monaco-editor'
        value={value || ''}
        onChange={e => onChange?.(e.target.value)}
      />
    );
  }),
  loader: {
    config: vi.fn(),
  },
}));

// Mock the stores and API
vi.mock('@/store/auth.store');
vi.mock('@/lib/api-client');

describe('PromptTemplateEditor', () => {
  // Add consistent timeout for async operations
  const ASYNC_TIMEOUT = { timeout: 3000 };

  const mockPrompts = [
    {
      id: 'prompt-1',
      name: 'Network Diagnostics',
      category: 'diagnostics',
      template: `You are a network diagnostic assistant.
Context: {{context}}
Issue: {{issue}}
Device: {{device_name}}

Analyze the network issue and provide diagnostic steps.`,
      variables: ['context', 'issue', 'device_name'],
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-10T00:00:00Z',
      created_by: 'owner@example.com',
      version: 3,
    },
    {
      id: 'prompt-2',
      name: 'Security Analysis',
      category: 'security',
      template: `Perform security analysis for the following:
System: {{system}}
Logs: {{logs}}

Identify potential security issues.`,
      variables: ['system', 'logs'],
      is_active: true,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-08T00:00:00Z',
      created_by: 'owner@example.com',
      version: 2,
    },
    {
      id: 'prompt-3',
      name: 'Performance Optimization',
      category: 'performance',
      template: `Analyze performance metrics:
{{metrics}}

Suggest optimizations.`,
      variables: ['metrics'],
      is_active: false,
      created_at: '2024-01-03T00:00:00Z',
      updated_at: '2024-01-03T00:00:00Z',
      created_by: 'owner@example.com',
      version: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock auth store - owner role
    vi.mocked(useAuthStore).mockReturnValue({
      user: { id: '1', email: 'owner@example.com', role: 'owner' },
      isAuthenticated: true,
    } as any);

    // Mock API responses with proper implementation
    vi.mocked(api.get).mockResolvedValue({ data: { prompts: mockPrompts } });
    vi.mocked(api.post).mockImplementation(() =>
      Promise.resolve({
        data: {
          success: true,
          prompt: { ...mockPrompts[0], id: 'new-prompt' },
        },
      })
    );
    vi.mocked(api.patch).mockImplementation(() =>
      Promise.resolve({
        data: { success: true, prompt: mockPrompts[0] },
      })
    );
    vi.mocked(api.delete).mockImplementation(() =>
      Promise.resolve({ data: { success: true } })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Access Control', () => {
    it('should render for owner role', () => {
      render(<PromptTemplateEditor />);
      expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
      expect(
        screen.getByText(/Manage AI prompt templates for network diagnostics/i)
      ).toBeInTheDocument();
    });

    it('should not render for admin role', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '2', email: 'admin@example.com', role: 'admin' },
        isAuthenticated: true,
      } as any);

      render(<PromptTemplateEditor />);
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(
        screen.getByText(/Only owners can manage AI prompt templates/i)
      ).toBeInTheDocument();
    });

    it('should not render for viewer role', () => {
      vi.mocked(useAuthStore).mockReturnValue({
        user: { id: '3', email: 'viewer@example.com', role: 'viewer' },
        isAuthenticated: true,
      } as any);

      render(<PromptTemplateEditor />);
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(
        screen.getByText(/Only owners can manage AI prompt templates/i)
      ).toBeInTheDocument();
    });
  });

  describe('Prompt List Display', () => {
    it('should display loading state while fetching prompts', () => {
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
      render(<PromptTemplateEditor />);
      expect(screen.getByTestId('prompts-loading')).toBeInTheDocument();
    });

    it('should display all prompts in a list', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
        expect(screen.getByText('Security Analysis')).toBeInTheDocument();
        expect(
          screen.getByText('Performance Optimization')
        ).toBeInTheDocument();
      });
    });

    it('should show prompt categories', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('diagnostics')).toBeInTheDocument();
        expect(screen.getByText('security')).toBeInTheDocument();
        expect(screen.getByText('performance')).toBeInTheDocument();
      });
    });

    it('should display active/inactive status', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        const prompt1 = screen.getByTestId('prompt-item-prompt-1');
        expect(within(prompt1).getByText('Active')).toHaveClass(
          'text-green-600'
        );

        const prompt3 = screen.getByTestId('prompt-item-prompt-3');
        expect(within(prompt3).getByText('Inactive')).toHaveClass(
          'text-gray-500'
        );
      });
    });

    it('should show version information', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        const prompt1 = screen.getByTestId('prompt-item-prompt-1');
        expect(within(prompt1).getByText('v3')).toBeInTheDocument();
      });
    });

    it('should handle empty prompt list', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { prompts: [] } });
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByText('No prompt templates found')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Create your first AI prompt template')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Monaco Editor Integration', () => {
    it('should display Monaco editor when selecting a prompt', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      expect(screen.getByTestId('monaco-editor')).toHaveValue(
        mockPrompts[0]!.template
      );
    });

    it('should configure Monaco editor with correct settings', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      expect(editor).toHaveAttribute('data-language', 'markdown');
      expect(editor).toHaveAttribute('data-theme', 'vs-dark');

      const options = JSON.parse(editor.getAttribute('data-options') || '{}');
      expect(options).toMatchObject({
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        lineNumbers: 'on',
        automaticLayout: true,
      });
    });

    it('should update template content in editor', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      await user.clear(editor);
      // Type text with variables - using paste to avoid bracket issues
      await user.click(editor);
      // Simulate paste event for the complete string with brackets
      await user.paste('New template content with {{variable}}');

      expect(editor).toHaveValue('New template content with {{variable}}');
    });

    it('should support syntax highlighting for variables', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      // Variables should be highlighted
      expect(screen.getByText(/Variables detected:/)).toBeInTheDocument();
      expect(screen.getByText('context')).toBeInTheDocument();
      expect(screen.getByText('issue')).toBeInTheDocument();
      expect(screen.getByText('device_name')).toBeInTheDocument();
    });
  });

  describe('Create New Prompt', () => {
    it('should show create button', async () => {
      render(<PromptTemplateEditor />);

      // Wait for the component to fully load including the templates section
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument(); // Card title
      });

      // Check for the button - it's within the card header
      const createButton = screen.getByText('Create Template');
      expect(createButton).toBeInTheDocument();
      expect(createButton.closest('button')).toBeInTheDocument();
    });

    it('should open create modal', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText('Create New Prompt Template')
      ).toBeInTheDocument();
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const saveButton = screen.getByRole('button', { name: /Save Template/i });
      await user.click(saveButton);

      expect(
        screen.getByText(/Template name is required/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Category is required/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Template content is required/i)
      ).toBeInTheDocument();
    });

    it('should create new prompt with correct data', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const nameInput = screen.getByLabelText(/Template Name/i);
      const categorySelect = screen.getByLabelText(/Category/i);
      const templateEditor = screen.getByTestId('monaco-editor');

      await user.type(nameInput, 'New Diagnostic Template');
      // Click select to open the dropdown, then select the option
      await user.click(categorySelect);
      const diagnosticsOption = await screen.findByRole('option', {
        name: 'diagnostics',
      });
      await user.click(diagnosticsOption);

      // Focus the template editor before pasting
      await user.click(templateEditor);
      await user.paste('Analyze {{system}} for {{issue}}');

      // Ensure Save button is in the dialog
      const saveButton = await screen.findByRole('button', {
        name: /Save Template/i,
      });
      expect(saveButton).toBeInTheDocument();

      await user.click(saveButton);

      // Check if api.post was called at all
      await waitFor(() => {
        expect(api.post).toHaveBeenCalled();
      }, ASYNC_TIMEOUT);

      // Then check the specific arguments
      expect(api.post).toHaveBeenCalledWith(
        '/api/prompts',
        expect.objectContaining({
          name: 'New Diagnostic Template',
          category: 'diagnostics',
          template: 'Analyze {{system}} for {{issue}}',
        })
      );
    });

    it('should auto-detect variables from template', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const templateEditor = screen.getByTestId('monaco-editor');
      await user.paste('Check {{device}} status and {{network}} connectivity');

      await waitFor(() => {
        expect(screen.getByText('Variables detected:')).toBeInTheDocument();
        expect(screen.getByText('device')).toBeInTheDocument();
        expect(screen.getByText('network')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);
    });
  });

  describe('Edit Existing Prompt', () => {
    it('should allow editing prompt template', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      await user.clear(editor);
      await user.paste('Updated template with {{new_variable}}');

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/prompts/prompt-1', {
          template: 'Updated template with {{new_variable}}',
          variables: ['new_variable'],
        });
      }, ASYNC_TIMEOUT);
    });

    it('should update prompt metadata', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const nameInput = screen.getByLabelText(/Template Name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Network Diagnostics');

      const categorySelect = screen.getByLabelText(/Category/i);
      await user.click(categorySelect);
      const securityOption = await screen.findByRole('option', {
        name: 'security',
      });
      await user.click(securityOption);

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/prompts/prompt-1',
          expect.objectContaining({
            name: 'Updated Network Diagnostics',
            category: 'security',
          })
        );
      });
    });

    it('should toggle active status', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const activeToggle = screen.getByLabelText(/Active/i);
      await user.click(activeToggle);

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          '/api/prompts/prompt-1',
          expect.objectContaining({
            is_active: false,
          })
        );
      });
    });

    itFull('should show version history', async () => {
      const user = userEvent.setup();

      // Mock the version history API response
      vi.mocked(api.get).mockImplementation(url => {
        if (url.includes('/history')) {
          return Promise.resolve({
            data: {
              versions: [
                {
                  id: 'v1',
                  version: 1,
                  template: 'Original template',
                  created_at: '2024-01-01T00:00:00Z',
                  created_by: 'owner@example.com',
                },
                {
                  id: 'v2',
                  version: 2,
                  template: 'Updated template',
                  created_at: '2024-01-05T00:00:00Z',
                  created_by: 'owner@example.com',
                },
                {
                  id: 'v3',
                  version: 3,
                  template: mockPrompts[0]!.template,
                  created_at: '2024-01-10T00:00:00Z',
                  created_by: 'owner@example.com',
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { prompts: mockPrompts } });
      });

      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      expect(screen.getByText('Version: 3')).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /View History/i }));

      await waitFor(() => {
        expect(screen.getByText('Version History')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Prompt', () => {
    it('should show delete button for each prompt', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const prompt1 = screen.getByTestId('prompt-item-prompt-1');
      // Click the dropdown menu button (MoreHorizontal icon)
      const moreButton = within(prompt1).getAllByRole('button')[0];
      await user.click(moreButton);

      // Check that delete option appears in dropdown
      expect(
        await screen.findByRole('menuitem', { name: /Delete/i })
      ).toBeInTheDocument();
    });

    it('should confirm before deleting', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const prompt1 = screen.getByTestId('prompt-item-prompt-1');
      const moreButton = within(prompt1).getAllByRole('button')[0];
      await user.click(moreButton);

      const deleteButton = await screen.findByRole('menuitem', {
        name: /Delete/i,
      });
      await user.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Are you sure you want to delete "Network Diagnostics"/i
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This action cannot be undone/i)
      ).toBeInTheDocument();
    });

    it('should delete prompt when confirmed', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const prompt1 = screen.getByTestId('prompt-item-prompt-1');
      const moreButton = within(prompt1).getAllByRole('button')[0];
      await user.click(moreButton);

      const deleteButton = await screen.findByRole('menuitem', {
        name: /Delete/i,
      });
      await user.click(deleteButton);

      await user.click(screen.getByRole('button', { name: /Confirm Delete/i }));

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/prompts/prompt-1');
        expect(
          screen.getByText(/Template deleted successfully/i)
        ).toBeInTheDocument();
      });
    });

    it('should prevent deletion of active prompts without confirmation', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const prompt1 = screen.getByTestId('prompt-item-prompt-1');
      const moreButton = within(prompt1).getAllByRole('button')[0];
      await user.click(moreButton);

      const deleteButton = await screen.findByRole('menuitem', {
        name: /Delete/i,
      });
      await user.click(deleteButton);

      expect(
        screen.getByText(/This template is currently active/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Deactivating it may affect system operations/i)
      ).toBeInTheDocument();
    });
  });

  describe('Template Validation', () => {
    it('should validate template syntax', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const templateEditor = screen.getByTestId('monaco-editor');
      // Type an actually invalid template with unclosed bracket
      await user.paste('Invalid {{variable syntax');

      await waitFor(() => {
        expect(
          screen.getByText(/Invalid variable syntax/i)
        ).toBeInTheDocument();
      });
    });

    it('should validate variable naming', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const templateEditor = screen.getByTestId('monaco-editor');
      await user.paste('Template with {{123invalid}}');

      expect(
        screen.getByText(/Variable names must start with a letter/i)
      ).toBeInTheDocument();
    });

    itFull('should warn about unused variables', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      await user.clear(editor);
      await user.type(editor, 'Template without variables');

      expect(
        screen.getByText(/Warning: No variables detected/i)
      ).toBeInTheDocument();
    });

    it('should validate template length', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      // Wait for component to fully load
      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      const createButton = screen.getByText('Create Template');
      await user.click(createButton);

      const templateEditor = screen.getByTestId('monaco-editor');
      const longTemplate = 'a'.repeat(10001); // Exceeds 10000 character limit
      await user.click(templateEditor);
      await user.paste(longTemplate);

      await waitFor(() => {
        expect(
          screen.getByText(/Template exceeds maximum length/i)
        ).toBeInTheDocument();
      }, ASYNC_TIMEOUT);
    });
  });

  describe('Template Testing', () => {
    it('should provide test interface', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      expect(
        screen.getByRole('button', { name: /Test Template/i })
      ).toBeInTheDocument();
    });

    it('should open test modal with variable inputs', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));
      await user.click(screen.getByRole('button', { name: /Test Template/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Test Prompt Template')).toBeInTheDocument();
      expect(screen.getByLabelText(/context/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/issue/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/device_name/i)).toBeInTheDocument();
    });

    it('should preview rendered template', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));
      await user.click(screen.getByRole('button', { name: /Test Template/i }));

      const contextInput = screen.getByLabelText(/context/i);
      const issueInput = screen.getByLabelText(/issue/i);
      const deviceInput = screen.getByLabelText(/device_name/i);

      await user.type(contextInput, 'Production environment');
      await user.type(issueInput, 'High latency');
      await user.type(deviceInput, 'Router-01');

      await user.click(screen.getByRole('button', { name: /Preview/i }));

      expect(screen.getByText(/Production environment/)).toBeInTheDocument();
      expect(screen.getByText(/High latency/)).toBeInTheDocument();
      expect(screen.getByText(/Router-01/)).toBeInTheDocument();
    });

    it('should test template with AI', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValue({
        data: {
          response: 'AI generated response based on template',
          tokens_used: 150,
        },
      });

      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));
      await user.click(screen.getByRole('button', { name: /Test Template/i }));

      const contextInput = screen.getByLabelText(/context/i);
      await user.type(contextInput, 'Test context');

      await user.click(screen.getByRole('button', { name: /Test with AI/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/prompts/test',
          expect.objectContaining({
            prompt_id: 'prompt-1',
            variables: expect.objectContaining({
              context: 'Test context',
            }),
          })
        );
        expect(screen.getByText('AI Response:')).toBeInTheDocument();
        expect(
          screen.getByText('AI generated response based on template')
        ).toBeInTheDocument();
        expect(screen.getByText(/Tokens used: 150/i)).toBeInTheDocument();
      });
    });
  });

  describe('Import/Export', () => {
    it('should provide export functionality', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Export All/i })
        ).toBeInTheDocument();
      });
    });

    it.skip('should export selected templates', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const checkbox = within(
        screen.getByTestId('prompt-item-prompt-1')
      ).getByRole('checkbox');
      await user.click(checkbox);

      await user.click(
        screen.getByRole('button', { name: /Export Selected/i })
      );

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/prompts/export', {
          prompt_ids: ['prompt-1'],
        });
      });
    });

    it('should provide import functionality', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Import/i })
        ).toBeInTheDocument();
      });
    });

    it('should validate imported templates', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Import/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Import/i }));

      const fileInput = screen.getByLabelText(/Select file/i);
      const invalidFile = new File(['invalid json'], 'templates.json', {
        type: 'application/json',
      });

      await user.upload(fileInput, invalidFile);

      expect(screen.getByText(/Invalid template format/i)).toBeInTheDocument();
    });
  });

  describe('Search and Filter', () => {
    it('should provide search functionality', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/Search templates/i)
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search templates/i);
      await user.type(searchInput, 'Network');

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
        expect(screen.queryByText('Security Analysis')).not.toBeInTheDocument();
        expect(
          screen.queryByText('Performance Optimization')
        ).not.toBeInTheDocument();
      });
    });

    it('should filter by category', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
      });

      // Find the select by its placeholder text within the trigger
      const categoryFilter = screen.getAllByRole('combobox')[0];
      await user.click(categoryFilter!);
      const diagnosticsOption = await screen.findByRole('option', {
        name: 'diagnostics',
      });
      await user.click(diagnosticsOption);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
        expect(screen.queryByText('Security Analysis')).not.toBeInTheDocument();
        expect(
          screen.queryByText('Performance Optimization')
        ).not.toBeInTheDocument();
      });
    });

    it('should filter by status', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
      });

      // Find the select by its position (second combobox)
      const statusFilter = screen.getAllByRole('combobox')[1];
      await user.click(statusFilter!);
      const inactiveOption = await screen.findByRole('option', {
        name: 'Inactive',
      });
      await user.click(inactiveOption);

      await waitFor(() => {
        expect(
          screen.queryByText('Network Diagnostics')
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Security Analysis')).not.toBeInTheDocument();
        expect(
          screen.getByText('Performance Optimization')
        ).toBeInTheDocument();
      });
    });
  });

  describeFull('Keyboard Shortcuts', () => {
    it('should save with Ctrl+S', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      await user.clear(editor);
      await user.type(editor, 'Updated content');

      await user.keyboard('{Control>}s{/Control}');

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalled();
      });
    });

    it('should toggle preview with Ctrl+P', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      await user.keyboard('{Control>}p{/Control}');

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      expect(
        screen.getByRole('main', { name: /AI Prompt Templates/i })
      ).toBeInTheDocument();
      const createButton = screen.getByText('Create Template');
      expect(createButton.closest('button')).toHaveAttribute('aria-label');
    });

    itFull('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('AI Prompt Templates')).toBeInTheDocument();
        expect(screen.getByText('Templates')).toBeInTheDocument();
      }, ASYNC_TIMEOUT);

      await user.tab();
      expect(
        screen.getByRole('button', { name: /Create Template/i })
      ).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should announce changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      const editor = screen.getByTestId('monaco-editor');
      await user.clear(editor);
      await user.type(editor, 'Updated');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      // Check for the screen reader announcement area
      const liveRegion = screen.getByRole('alert', { hidden: true });
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });
  });
});
