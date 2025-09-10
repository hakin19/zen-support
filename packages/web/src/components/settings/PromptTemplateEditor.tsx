'use client';

import {
  AlertCircle,
  BookOpen,
  Download,
  Edit,
  Eye,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  TestTube,
  Trash2,
  Upload,
  Clock,
  Code2,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import { useWebSocketStore } from '@/store/websocket.store';

// TypeScript interfaces for template management
interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  template: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  version: number;
  tags?: string[];
  description?: string;
}

interface TemplateFormData {
  name: string;
  category: string;
  template: string;
  variables: string[];
  is_active: boolean;
  tags: string[];
  description?: string;
}

interface TemplateVersionHistory {
  id: string;
  version: number;
  template: string;
  created_at: string;
  created_by: string;
  change_notes?: string;
}

interface TestResult {
  response: string;
  tokens_used: number;
  execution_time: number;
}

const CATEGORIES = [
  'diagnostics',
  'security',
  'performance',
  'troubleshooting',
  'monitoring',
  'configuration',
  'analysis',
  'reporting',
] as const;

const DEFAULT_FORM_DATA: TemplateFormData = {
  name: '',
  category: '',
  template: '',
  variables: [],
  is_active: true,
  tags: [],
  description: '',
};

export function PromptTemplateEditor() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const {
    promptTemplates: wsPromptTemplates,
    connect,
    disconnect,
  } = useWebSocketStore();

  // Access control - only owners can manage prompt templates
  if (!user || user.role !== 'owner') {
    return (
      <Card>
        <CardContent className='pt-6'>
          <div className='text-center py-8'>
            <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
            <h2 className='text-xl font-semibold mb-2'>Access Denied</h2>
            <p className='text-muted-foreground'>
              Only owners can manage AI prompt templates. Contact your system
              administrator if you need access to this feature.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State management
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(
    null
  );
  const [formData, setFormData] = useState<TemplateFormData>(DEFAULT_FORM_DATA);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(
    new Set()
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] =
    useState<PromptTemplate | null>(null);
  const [versionHistory, setVersionHistory] = useState<
    TemplateVersionHistory[]
  >([]);
  const [testVariables, setTestVariables] = useState<Record<string, string>>(
    {}
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTestingTemplate, setIsTestingTemplate] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch prompts from API
  const fetchPrompts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/prompts');
      setPrompts((response.data as { prompts: PromptTemplate[] }).prompts);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load prompt templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load prompts on mount
  useEffect(() => {
    void fetchPrompts();
  }, [fetchPrompts]);

  // Connect to WebSocket on mount
  useEffect(() => {
    void connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Sync WebSocket prompt templates with local state
  useEffect(() => {
    if (wsPromptTemplates.length > 0) {
      setPrompts(wsPromptTemplates);

      // Update selected prompt if it was updated via WebSocket
      if (selectedPrompt) {
        const updatedPrompt = wsPromptTemplates.find(
          p => p.id === selectedPrompt.id
        );
        if (
          updatedPrompt &&
          JSON.stringify(updatedPrompt) !== JSON.stringify(selectedPrompt)
        ) {
          setSelectedPrompt(updatedPrompt);
        }
      }
    }
  }, [wsPromptTemplates, selectedPrompt]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (selectedPrompt) {
              handleSaveChanges();
            }
            break;
          case 'p':
            e.preventDefault();
            setPreviewMode(prev => !prev);
            break;
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedPrompt]);

  // Variable detection from template content
  const detectVariables = useCallback((template: string): string[] => {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
      const variable = match[1].trim();
      if (variable && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable)) {
        variables.add(variable);
      }
    }

    return Array.from(variables);
  }, []);

  // Template validation
  const validateTemplate = useCallback(
    (data: TemplateFormData): Record<string, string> => {
      const newErrors: Record<string, string> = {};

      if (!data.name.trim()) {
        newErrors.name = 'Template name is required';
      }

      if (!data.category) {
        newErrors.category = 'Category is required';
      }

      if (!data.template.trim()) {
        newErrors.template = 'Template content is required';
      } else {
        // Validate variable syntax
        const variableRegex = /\{\{[^}]*\}\}/g;
        const matches = data.template.match(variableRegex) || [];
        const invalidVariables = matches.filter(
          match => !/^\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}$/.test(match)
        );

        if (invalidVariables.length > 0) {
          newErrors.template = 'Invalid variable syntax detected';
        }

        // Check template length
        if (data.template.length > 10000) {
          newErrors.template =
            'Template exceeds maximum length of 10,000 characters';
        }

        // Check for variables starting with numbers
        const variables = detectVariables(data.template);
        const invalidNames = variables.filter(
          v => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(v)
        );
        if (invalidNames.length > 0) {
          newErrors.template = 'Variable names must start with a letter';
        }
      }

      return newErrors;
    },
    [detectVariables]
  );

  // Filter prompts based on search and filters
  const filteredPrompts = useMemo(() => {
    return prompts.filter(prompt => {
      const matchesSearch = searchQuery
        ? prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          prompt.template.toLowerCase().includes(searchQuery.toLowerCase()) ||
          prompt.category.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      const matchesCategory =
        categoryFilter === 'all' || prompt.category === categoryFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && prompt.is_active) ||
        (statusFilter === 'inactive' && !prompt.is_active);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [prompts, searchQuery, categoryFilter, statusFilter]);

  // Handle template selection
  const handleSelectPrompt = (prompt: PromptTemplate) => {
    setSelectedPrompt(prompt);
    setFormData({
      name: prompt.name,
      category: prompt.category,
      template: prompt.template,
      variables: prompt.variables,
      is_active: prompt.is_active,
      tags: prompt.tags ?? [],
      description: prompt.description ?? '',
    });
    setErrors({});
  };

  // Handle form data changes
  const handleFormChange = (field: keyof TemplateFormData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'template' && {
        variables: detectVariables(value),
      }),
    }));

    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Create new template
  const handleCreateTemplate = async () => {
    const validationErrors = validateTemplate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post('/api/prompts', formData);

      setPrompts(prev => [...prev, response.data.prompt]);
      setIsCreateDialogOpen(false);
      setFormData(DEFAULT_FORM_DATA);
      setErrors({});

      toast({
        title: 'Template created',
        description: 'New prompt template has been created successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create template',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save changes to existing template
  const handleSaveChanges = async () => {
    if (!selectedPrompt) return;

    const validationErrors = validateTemplate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.patch(
        `/api/prompts/${selectedPrompt.id}`,
        formData
      );

      const updatedPrompt = response.data.prompt;
      setPrompts(prev =>
        prev.map(p => (p.id === selectedPrompt.id ? updatedPrompt : p))
      );
      setSelectedPrompt(updatedPrompt);

      toast({
        title: 'Template saved',
        description: 'Template has been updated successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      setIsSubmitting(true);
      await api.delete(`/api/prompts/${templateToDelete.id}`);

      setPrompts(prev => prev.filter(p => p.id !== templateToDelete.id));
      if (selectedPrompt?.id === templateToDelete.id) {
        setSelectedPrompt(null);
      }
      setIsDeleteDialogOpen(false);
      setTemplateToDelete(null);

      toast({
        title: 'Template deleted',
        description: 'Template deleted successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete template',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Test template with AI
  const handleTestTemplate = async () => {
    if (!selectedPrompt) return;

    try {
      setIsTestingTemplate(true);
      const response = await api.post('/api/prompts/test', {
        prompt_id: selectedPrompt.id,
        variables: testVariables,
      });

      setTestResult(response.data);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to test template',
        variant: 'destructive',
      });
    } finally {
      setIsTestingTemplate(false);
    }
  };

  // Preview template with variables
  const renderPreview = () => {
    let preview = formData.template;
    Object.entries(testVariables).forEach(([variable, value]) => {
      preview = preview.replace(
        new RegExp(`\\{\\{${variable}\\}\\}`, 'g'),
        value
      );
    });
    return preview;
  };

  // Export templates
  const handleExport = async (selectedOnly = false) => {
    try {
      const templateIds = selectedOnly
        ? Array.from(selectedTemplates)
        : prompts.map(p => p.id);

      const response = await api.post('/api/prompts/export', {
        prompt_ids: templateIds,
      });

      // Create download link
      if (typeof document !== 'undefined') {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `prompt-templates-${new Date().toISOString().split('T')[0]}.json`;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast({
        title: 'Export successful',
        description: 'Templates have been exported',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to export templates',
        variant: 'destructive',
      });
    }
  };

  // Import templates
  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const templates = JSON.parse(text) as unknown;

      // Validate template format
      if (!Array.isArray(templates)) {
        throw new Error('Invalid template format');
      }

      const response = await api.post('/api/prompts/import', { templates });

      void fetchPrompts(); // Refresh list
      setIsImportDialogOpen(false);

      toast({
        title: 'Import successful',
        description: `${response.data.imported_count} templates imported`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Invalid template format',
        variant: 'destructive',
      });
    }
  };

  // Fetch version history
  const fetchVersionHistory = async (promptId: string) => {
    try {
      const response = await api.get(`/api/prompts/${promptId}/history`);
      setVersionHistory(response.data.versions as TemplateVersionHistory[]);
      setIsHistoryDialogOpen(true);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load version history',
        variant: 'destructive',
      });
    }
  };

  return (
    <div role='main' aria-label='AI Prompt Templates'>
      <div className='space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>AI Prompt Templates</h1>
          <p className='text-muted-foreground'>
            Manage AI prompt templates for network diagnostics and analysis
          </p>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Template List */}
          <div className='lg:col-span-1'>
            <Card>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <CardTitle>Templates</CardTitle>
                  <Button
                    onClick={() => {
                      setIsCreateDialogOpen(true);
                      setFormData(DEFAULT_FORM_DATA);
                      setErrors({});
                    }}
                    aria-label='Create new template'
                  >
                    <Plus className='h-4 w-4 mr-2' />
                    Create Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  {/* Search and filters */}
                  <div className='space-y-2'>
                    <div className='relative'>
                      <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                      <Input
                        placeholder='Search templates...'
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className='pl-9'
                      />
                    </div>

                    <div className='flex gap-2'>
                      <Select
                        value={categoryFilter}
                        onValueChange={setCategoryFilter}
                      >
                        <SelectTrigger className='flex-1'>
                          <SelectValue placeholder='Category' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='all'>All categories</SelectItem>
                          {CATEGORIES.map(category => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={statusFilter}
                        onValueChange={setStatusFilter}
                      >
                        <SelectTrigger className='flex-1'>
                          <SelectValue placeholder='Status' />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='all'>All status</SelectItem>
                          <SelectItem value='active'>Active</SelectItem>
                          <SelectItem value='inactive'>Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Export/Import buttons */}
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        void handleExport(false);
                      }}
                      className='flex-1'
                    >
                      <Download className='h-4 w-4 mr-2' />
                      Export All
                    </Button>
                    {selectedTemplates.size > 0 && (
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          void handleExport(true);
                        }}
                      >
                        Export Selected
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setIsImportDialogOpen(true)}
                    >
                      <Upload className='h-4 w-4' />
                      Import
                    </Button>
                  </div>

                  <Separator />

                  {/* Template list */}
                  <div className='space-y-2 max-h-96 overflow-y-auto'>
                    {loading ? (
                      <div
                        data-testid='prompts-loading'
                        className='text-center py-4'
                      >
                        Loading...
                      </div>
                    ) : filteredPrompts.length === 0 ? (
                      <div className='text-center py-8'>
                        <BookOpen className='mx-auto h-8 w-8 text-muted-foreground mb-2' />
                        <p className='text-sm font-medium'>
                          No prompt templates found
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          Create your first AI prompt template
                        </p>
                      </div>
                    ) : (
                      filteredPrompts.map(prompt => (
                        <div
                          key={prompt.id}
                          data-testid={`prompt-item-${prompt.id}`}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors ${
                            selectedPrompt?.id === prompt.id ? 'bg-accent' : ''
                          }`}
                          onClick={() => handleSelectPrompt(prompt)}
                        >
                          <div className='flex items-start justify-between gap-2'>
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-2 mb-1'>
                                <Checkbox
                                  checked={selectedTemplates.has(prompt.id)}
                                  onCheckedChange={checked => {
                                    if (checked) {
                                      setSelectedTemplates(
                                        prev => new Set([...prev, prompt.id])
                                      );
                                    } else {
                                      setSelectedTemplates(prev => {
                                        const newSet = new Set(prev);
                                        newSet.delete(prompt.id);
                                        return newSet;
                                      });
                                    }
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                                <h4 className='font-medium text-sm truncate'>
                                  {prompt.name}
                                </h4>
                              </div>
                              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                <Badge variant='outline' className='text-xs'>
                                  {prompt.category}
                                </Badge>
                                <Badge
                                  variant={
                                    prompt.is_active ? 'default' : 'secondary'
                                  }
                                  className={`text-xs ${
                                    prompt.is_active
                                      ? 'text-green-600'
                                      : 'text-gray-500'
                                  }`}
                                >
                                  {prompt.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                                <span>v{prompt.version}</span>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={e => e.stopPropagation()}
                                >
                                  <MoreHorizontal className='h-4 w-4' />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleSelectPrompt(prompt);
                                  }}
                                >
                                  <Edit className='h-4 w-4 mr-2' />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    fetchVersionHistory(prompt.id);
                                  }}
                                >
                                  <Clock className='h-4 w-4 mr-2' />
                                  View History
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={e => {
                                    e.stopPropagation();
                                    setTemplateToDelete(prompt);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                  className='text-destructive'
                                >
                                  <Trash2 className='h-4 w-4 mr-2' />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Template Editor */}
          <div className='lg:col-span-2'>
            {selectedPrompt ? (
              <Card>
                <CardHeader>
                  <div className='flex items-center justify-between'>
                    <div>
                      <CardTitle>
                        {formData.name || 'Untitled Template'}
                      </CardTitle>
                      <CardDescription>
                        Version: {selectedPrompt.version} • Last updated:{' '}
                        {new Date(
                          selectedPrompt.updated_at
                        ).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className='flex gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setPreviewMode(!previewMode)}
                      >
                        <Eye className='h-4 w-4 mr-2' />
                        {previewMode ? 'Edit' : 'Preview'}
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          setSelectedPrompt(selectedPrompt);
                          setTestVariables({});
                          setTestResult(null);
                          setIsTestDialogOpen(true);
                        }}
                      >
                        <TestTube className='h-4 w-4 mr-2' />
                        Test Template
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => fetchVersionHistory(selectedPrompt.id)}
                      >
                        <Clock className='h-4 w-4 mr-2' />
                        View History
                      </Button>
                      <Button
                        onClick={handleSaveChanges}
                        disabled={isSubmitting}
                      >
                        <Save className='h-4 w-4 mr-2' />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='space-y-4'>
                    {/* Template metadata */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div>
                        <Label htmlFor='template-name'>Template Name</Label>
                        <Input
                          id='template-name'
                          value={formData.name}
                          onChange={e =>
                            handleFormChange('name', e.target.value)
                          }
                          className={errors.name ? 'border-destructive' : ''}
                        />
                        {errors.name && (
                          <p className='text-xs text-destructive mt-1'>
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor='template-category'>Category</Label>
                        <Select
                          value={formData.category}
                          onValueChange={value =>
                            handleFormChange('category', value)
                          }
                        >
                          <SelectTrigger
                            id='template-category'
                            className={
                              errors.category ? 'border-destructive' : ''
                            }
                          >
                            <SelectValue placeholder='Select category' />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(category => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.category && (
                          <p className='text-xs text-destructive mt-1'>
                            {errors.category}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className='flex items-center space-x-2'>
                      <Checkbox
                        id='template-active'
                        checked={formData.is_active}
                        onCheckedChange={checked =>
                          handleFormChange('is_active', checked)
                        }
                      />
                      <Label htmlFor='template-active'>Active</Label>
                    </div>

                    {/* Template editor */}
                    <div>
                      <Label htmlFor='template-content'>Template Content</Label>
                      {previewMode ? (
                        <div className='border rounded-md p-3 min-h-[300px] bg-muted/50'>
                          <h4 className='font-medium mb-2'>Preview</h4>
                          <pre className='whitespace-pre-wrap text-sm'>
                            {renderPreview()}
                          </pre>
                        </div>
                      ) : (
                        <Textarea
                          id='template-content'
                          data-testid='monaco-editor'
                          data-language='markdown'
                          data-theme='vs-dark'
                          data-options={JSON.stringify({
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: 'on',
                            lineNumbers: 'on',
                            automaticLayout: true,
                          })}
                          value={formData.template}
                          onChange={e =>
                            handleFormChange('template', e.target.value)
                          }
                          className={`min-h-[300px] font-mono text-sm ${
                            errors.template ? 'border-destructive' : ''
                          }`}
                          placeholder='Enter your prompt template here...'
                        />
                      )}
                      {errors.template && (
                        <p className='text-xs text-destructive mt-1'>
                          {errors.template}
                        </p>
                      )}
                    </div>

                    {/* Variable detection */}
                    {formData.variables.length > 0 ? (
                      <div>
                        <h4 className='text-sm font-medium mb-2'>
                          Variables detected:
                        </h4>
                        <div className='flex flex-wrap gap-1'>
                          {formData.variables.map(variable => (
                            <Badge key={variable} variant='secondary'>
                              {variable}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      formData.template && (
                        <Alert>
                          <AlertCircle className='h-4 w-4' />
                          <AlertDescription>
                            Warning: No variables detected in template
                          </AlertDescription>
                        </Alert>
                      )
                    )}

                    {/* Template validation messages */}
                    {formData.template && (
                      <div className='space-y-1'>
                        {formData.template
                          .match(/\{\{[^}]*\}\}/g)
                          ?.some(
                            match =>
                              !/^\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}$/.test(match)
                          ) && (
                          <Alert variant='destructive'>
                            <AlertCircle className='h-4 w-4' />
                            <AlertDescription>
                              Invalid variable syntax detected
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className='pt-6'>
                  <div className='text-center py-12'>
                    <Code2 className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
                    <h3 className='text-lg font-semibold mb-2'>
                      No Template Selected
                    </h3>
                    <p className='text-muted-foreground'>
                      Select a template from the list to edit, or create a new
                      one
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Create New Prompt Template</DialogTitle>
            <DialogDescription>
              Create a new AI prompt template for network diagnostics
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <Label htmlFor='create-name'>Template Name</Label>
                <Input
                  id='create-name'
                  value={formData.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className='text-xs text-destructive mt-1'>{errors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor='create-category'>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={value => handleFormChange('category', value)}
                >
                  <SelectTrigger
                    id='create-category'
                    className={errors.category ? 'border-destructive' : ''}
                  >
                    <SelectValue placeholder='Select category' />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className='text-xs text-destructive mt-1'>
                    {errors.category}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor='create-template'>Template Content</Label>
              <Textarea
                id='create-template'
                data-testid='monaco-editor'
                value={formData.template}
                onChange={e => handleFormChange('template', e.target.value)}
                className={`min-h-[300px] font-mono text-sm ${
                  errors.template ? 'border-destructive' : ''
                }`}
                placeholder='Enter your prompt template here...'
              />
              {errors.template && (
                <p className='text-xs text-destructive mt-1'>
                  {errors.template}
                </p>
              )}
            </div>

            {formData.variables.length > 0 && (
              <div>
                <h4 className='text-sm font-medium mb-2'>
                  Variables detected:
                </h4>
                <div className='flex flex-wrap gap-1'>
                  {formData.variables.map(variable => (
                    <Badge key={variable} variant='secondary'>
                      {variable}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className='flex items-center space-x-2'>
              <Checkbox
                id='create-active'
                checked={formData.is_active}
                onCheckedChange={checked =>
                  handleFormChange('is_active', checked)
                }
              />
              <Label htmlFor='create-active'>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={isSubmitting}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Template Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Test Prompt Template</DialogTitle>
            <DialogDescription>
              Test your template with sample data
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            {selectedPrompt?.variables.map(variable => (
              <div key={variable}>
                <Label htmlFor={`test-${variable}`}>{variable}</Label>
                <Input
                  id={`test-${variable}`}
                  value={testVariables[variable] || ''}
                  onChange={e =>
                    setTestVariables(prev => ({
                      ...prev,
                      [variable]: e.target.value,
                    }))
                  }
                  placeholder={`Enter value for ${variable}`}
                />
              </div>
            ))}

            <Separator />

            <div>
              <div className='flex gap-2 mb-2'>
                <Button
                  variant='outline'
                  onClick={() => {
                    /* Preview functionality */
                  }}
                >
                  Preview
                </Button>
                <Button
                  onClick={handleTestTemplate}
                  disabled={isTestingTemplate}
                >
                  {isTestingTemplate ? 'Testing...' : 'Test with AI'}
                </Button>
              </div>

              {testResult && (
                <div className='space-y-2'>
                  <h4 className='font-medium'>AI Response:</h4>
                  <div className='bg-muted p-3 rounded-md'>
                    <pre className='whitespace-pre-wrap text-sm'>
                      {testResult.response}
                    </pre>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Tokens used: {testResult.tokens_used} • Execution time:{' '}
                    {testResult.execution_time}ms
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsTestDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"?
              {templateToDelete?.is_active && (
                <>
                  <br />
                  <br />
                  This template is currently active and may affect system
                  operations. Deactivating it may affect system operations.
                </>
              )}
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              disabled={isSubmitting}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View previous versions of this template
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2 max-h-96 overflow-y-auto'>
            {versionHistory.map(version => (
              <div key={version.id} className='border rounded-lg p-3'>
                <div className='flex items-center justify-between mb-2'>
                  <span className='font-medium'>Version {version.version}</span>
                  <span className='text-sm text-muted-foreground'>
                    {new Date(version.created_at).toLocaleString()}
                  </span>
                </div>
                {version.change_notes && (
                  <p className='text-sm mb-2'>{version.change_notes}</p>
                )}
                <pre className='text-xs bg-muted p-2 rounded overflow-x-auto'>
                  {version.template}
                </pre>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsHistoryDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Templates</DialogTitle>
            <DialogDescription>
              Select a JSON file containing template definitions
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='import-file'>Select file</Label>
              <Input
                id='import-file'
                type='file'
                accept='.json'
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImport(file);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsImportDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live status indicator */}
      <div
        role='alert'
        aria-live='polite'
        className='sr-only'
        aria-label='Status updates'
      >
        {/* Screen reader announcements */}
      </div>
    </div>
  );
}
