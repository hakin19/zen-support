/* global window */
'use client';

import {
  Users,
  Settings as SettingsIcon,
  Building2,
  Brain,
  Menu,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Component,
  type JSX,
} from 'react';

import { DeviceRegistration } from './DeviceRegistration';
import { OrganizationSettings } from './OrganizationSettings';
import { PromptTemplateEditor } from './PromptTemplateEditor';
import { UserManagement } from './UserManagement';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/auth.store';

type TabId = 'users' | 'devices' | 'ai-prompts' | 'organization';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; 'data-testid'?: string }>;
  component: React.ComponentType<Record<string, unknown>>;
  roles: Array<'owner' | 'admin' | 'viewer'>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Settings component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert>
          <AlertDescription>
            Something went wrong loading this settings section.
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                this.setState({ hasError: false, error: undefined })
              }
              className='ml-2'
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export function SettingsPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated: _isAuthenticated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<TabId>('users');
  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(new Set(['users']));
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const tabListRef = useRef<HTMLDivElement>(null);

  // Define tabs with role-based access
  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'users',
        label: 'Users',
        icon: ({ className, 'data-testid': testId }) => (
          <Users className={className} data-testid={testId} />
        ),
        component: UserManagement,
        roles: ['owner', 'admin', 'viewer'],
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: ({ className, 'data-testid': testId }) => (
          <SettingsIcon className={className} data-testid={testId} />
        ),
        component: DeviceRegistration,
        roles: ['owner', 'admin', 'viewer'],
      },
      {
        id: 'ai-prompts',
        label: 'AI Prompts',
        icon: ({ className, 'data-testid': testId }) => (
          <Brain className={className} data-testid={testId} />
        ),
        component: PromptTemplateEditor,
        roles: ['owner'], // Only owners can access AI prompts
      },
      {
        id: 'organization',
        label: 'Organization',
        icon: ({ className, 'data-testid': testId }) => (
          <Building2 className={className} data-testid={testId} />
        ),
        component: OrganizationSettings,
        roles: ['owner', 'admin', 'viewer'],
      },
    ],
    []
  );

  // Filter tabs based on user role
  const visibleTabs = useMemo(() => {
    if (!user) return [];
    return tabs.filter(tab => tab.roles.includes(user.role));
  }, [tabs, user]);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Check mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 640px)').matches);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle URL-based tab navigation
  useEffect(() => {
    // Support both searchParams (App Router) and router.query (Pages Router) for testing
    const tabParam = searchParams?.get('tab') || (router as any).query?.tab;
    if (tabParam && visibleTabs.some(tab => tab.id === tabParam)) {
      setActiveTab(tabParam as TabId);
      setLoadedTabs(prev => new Set([...prev, tabParam as TabId]));
    }
  }, [searchParams, router, visibleTabs]);

  const handleTabChange = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId);
      setLoadedTabs(prev => new Set([...prev, tabId]));
      setMobileMenuOpen(false);

      // Update URL
      router.push(`/settings?tab=${tabId}`);

      // Announce tab change for screen readers
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        setAnnouncement(`${tab.label} tab selected`);
        // Clear announcement after screen readers have time to read it
        setTimeout(() => setAnnouncement(''), 1000);
      }
    },
    [router, tabs]
  );

  const handleKeyNavigation = useCallback(
    (event: React.KeyboardEvent, tabId: TabId) => {
      const currentIndex = visibleTabs.findIndex(tab => tab.id === tabId);
      let nextIndex = currentIndex;

      switch (event.key) {
        case 'ArrowLeft':
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : visibleTabs.length - 1;
          break;
        case 'ArrowRight':
          nextIndex =
            currentIndex < visibleTabs.length - 1 ? currentIndex + 1 : 0;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          handleTabChange(tabId);
          return;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = visibleTabs[nextIndex];
      if (nextTab) {
        const nextTabElement = document.getElementById(`tab-${nextTab.id}`);
        nextTabElement?.focus();
      }
    },
    [visibleTabs, handleTabChange]
  );

  const activeTabData = visibleTabs.find(tab => tab.id === activeTab);
  const ActiveComponent = activeTabData?.component;

  // Get pending invitations count for badge
  const pendingInvitations =
    (useAuthStore as any).getState().pendingInvitations || 0;

  const isReadOnly = user?.role === 'viewer';

  return (
    <div className='container mx-auto py-6 px-4'>
      <div className='mb-6'>
        <h1 className='text-3xl font-bold tracking-tight'>Settings</h1>
        <p className='text-muted-foreground'>
          Manage your organization and account settings
        </p>
        {isReadOnly && (
          <Alert className='mt-4'>
            <AlertDescription>
              Read-only access: You can view settings but cannot make changes.
              Contact an admin for edit access.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Screen reader announcement */}
      <div
        role='status'
        aria-live='polite'
        className='sr-only'
        aria-hidden={!announcement}
      >
        {announcement}
      </div>

      <Card>
        <CardContent className='p-0'>
          {/* Desktop Tabs */}
          {!isMobile ? (
            <nav
              role='navigation'
              aria-label='Settings navigation'
              className='border-b'
            >
              <div
                role='tablist'
                ref={tabListRef}
                className='flex space-x-8 px-6'
              >
                {visibleTabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;

                  return (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      role='tab'
                      aria-selected={isActive}
                      aria-controls={`tabpanel-${tab.id}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => handleTabChange(tab.id)}
                      onKeyDown={e => handleKeyNavigation(e, tab.id)}
                      className={`
                        relative flex items-center space-x-2 py-4 px-1
                        border-b-2 font-medium text-sm transition-colors
                        ${prefersReducedMotion ? 'transition-none' : ''}
                        ${
                          isActive
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
                        }
                      `}
                    >
                      <Icon
                        className='h-4 w-4'
                        data-testid={`${tab.id.replace('-', '')}-icon`}
                      />
                      <span>{tab.label}</span>
                      {tab.id === 'users' && pendingInvitations > 0 && (
                        <span className='bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center'>
                          {pendingInvitations}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>
          ) : (
            /* Mobile Dropdown */
            <div className='border-b p-6' data-testid='mobile-tab-menu'>
              <DropdownMenu
                open={mobileMenuOpen}
                onOpenChange={setMobileMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' className='w-full justify-between'>
                    <span className='flex items-center space-x-2'>
                      {activeTabData && (
                        <>
                          <activeTabData.icon className='h-4 w-4' />
                          <span>{activeTabData.label}</span>
                        </>
                      )}
                    </span>
                    <Menu className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className='w-full' role='menu'>
                  {visibleTabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                      <DropdownMenuItem
                        key={tab.id}
                        role='menuitem'
                        onClick={() => handleTabChange(tab.id)}
                        className='flex items-center space-x-2'
                      >
                        <Icon className='h-4 w-4' />
                        <span>{tab.label}</span>
                        {tab.id === 'users' && pendingInvitations > 0 && (
                          <span className='bg-red-500 text-white text-xs rounded-full px-2 py-1 ml-auto'>
                            {pendingInvitations}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Tab Content */}
          <div
            role='tabpanel'
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className='p-6'
          >
            {activeTabData && (
              <ErrorBoundary>
                {loadedTabs.has(activeTab) && ActiveComponent ? (
                  <ActiveComponent readOnly={isReadOnly} />
                ) : (
                  <div className='flex items-center justify-center py-12'>
                    <div className='text-muted-foreground'>Loading...</div>
                  </div>
                )}
              </ErrorBoundary>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
