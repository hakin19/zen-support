import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PromptTemplateEditor } from './PromptTemplateEditor';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';
import * as monaco from 'monaco-editor';

// Mock Monaco Editor
vi.mock('monaco-editor');
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, language, theme, options }: any) => (
    <textarea
      data-testid='monaco-editor'
      value={value}
      onChange={e => onChange?.(e.target.value)}
      data-language={language}
      data-theme={theme}
      data-options={JSON.stringify(options)}
    />
  ),
}));

// Mock the stores and API
vi.mock('@/store/auth.store');
vi.mock('@/lib/api-client');

describe('PromptTemplateEditor', () => {
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

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({ data: { prompts: mockPrompts } });
    vi.mocked(api.post).mockResolvedValue({
      data: { success: true, prompt: mockPrompts[0] },
    });
    vi.mocked(api.patch).mockResolvedValue({
      data: { success: true, prompt: mockPrompts[0] },
    });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
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
        mockPrompts[0].template
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
      await user.type(editor, 'New template content with {{variable}}');

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
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });
    });

    it('should open create modal', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText('Create New Prompt Template')
      ).toBeInTheDocument();
    });

    it('should validate required fields', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

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

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      const nameInput = screen.getByLabelText(/Template Name/i);
      const categorySelect = screen.getByLabelText(/Category/i);
      const templateEditor = screen.getByTestId('monaco-editor');

      await user.type(nameInput, 'New Diagnostic Template');
      await user.selectOptions(categorySelect, 'diagnostics');
      await user.type(templateEditor, 'Analyze {{system}} for {{issue}}');

      await user.click(screen.getByRole('button', { name: /Save Template/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/prompts', {
          name: 'New Diagnostic Template',
          category: 'diagnostics',
          template: 'Analyze {{system}} for {{issue}}',
          variables: ['system', 'issue'],
          is_active: true,
        });
      });
    });

    it('should auto-detect variables from template', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      const templateEditor = screen.getByTestId('monaco-editor');
      await user.type(
        templateEditor,
        'Check {{device}} status and {{network}} connectivity'
      );

      await waitFor(() => {
        expect(screen.getByText('Variables detected:')).toBeInTheDocument();
        expect(screen.getByText('device')).toBeInTheDocument();
        expect(screen.getByText('network')).toBeInTheDocument();
      });
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
      await user.type(editor, 'Updated template with {{new_variable}}');

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      await user.click(saveButton);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/api/prompts/prompt-1', {
          template: 'Updated template with {{new_variable}}',
          variables: ['new_variable'],
        });
      });
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
      await user.selectOptions(categorySelect, 'security');

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

    it('should show version history', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByText('Network Diagnostics')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Network Diagnostics'));

      expect(screen.getByText('Version: 3')).toBeInTheDocument();
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /View History/i }));

      expect(screen.getByText('Version History')).toBeInTheDocument();
    });
  });

  describe('Delete Prompt', () => {
    it('should show delete button for each prompt', async () => {
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        const prompt1 = screen.getByTestId('prompt-item-prompt-1');
        expect(
          within(prompt1).getByRole('button', { name: /Delete/i })
        ).toBeInTheDocument();
      });
    });

    it('should confirm before deleting', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-item-prompt-1')).toBeInTheDocument();
      });

      const deleteButton = within(
        screen.getByTestId('prompt-item-prompt-1')
      ).getByRole('button', { name: /Delete/i });
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

      const deleteButton = within(
        screen.getByTestId('prompt-item-prompt-1')
      ).getByRole('button', { name: /Delete/i });
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

      const deleteButton = within(
        screen.getByTestId('prompt-item-prompt-1')
      ).getByRole('button', { name: /Delete/i });
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

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      const templateEditor = screen.getByTestId('monaco-editor');
      await user.type(templateEditor, 'Invalid {{variable} syntax');

      expect(screen.getByText(/Invalid variable syntax/i)).toBeInTheDocument();
    });

    it('should validate variable naming', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      const templateEditor = screen.getByTestId('monaco-editor');
      await user.type(templateEditor, 'Template with {{123invalid}}');

      expect(
        screen.getByText(/Variable names must start with a letter/i)
      ).toBeInTheDocument();
    });

    it('should warn about unused variables', async () => {
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

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', { name: /Create Template/i })
      );

      const templateEditor = screen.getByTestId('monaco-editor');
      const longTemplate = 'a'.repeat(10001); // Exceeds 10000 character limit
      await user.type(templateEditor, longTemplate);

      expect(
        screen.getByText(/Template exceeds maximum length/i)
      ).toBeInTheDocument();
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

    it('should export selected templates', async () => {
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
        expect(
          screen.getByLabelText(/Filter by category/i)
        ).toBeInTheDocument();
      });

      const categoryFilter = screen.getByLabelText(/Filter by category/i);
      await user.selectOptions(categoryFilter, 'diagnostics');

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
        expect(screen.getByLabelText(/Filter by status/i)).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/Filter by status/i);
      await user.selectOptions(statusFilter, 'inactive');

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

  describe('Keyboard Shortcuts', () => {
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
        expect(
          screen.getByRole('main', { name: /AI Prompt Templates/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toHaveAttribute('aria-label');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<PromptTemplateEditor />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Create Template/i })
        ).toBeInTheDocument();
      });

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

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/Template saved successfully/i);
        expect(alert).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});
