'use client';

import {
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Palette,
  Shield,
  Clock,
  Network,
  Plus,
  Trash2,
  TestTube,
  CreditCard,
  AlertTriangle,
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

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

// TypeScript interfaces
interface OrganizationSettings {
  allow_sso: boolean;
  enforce_2fa: boolean;
  session_timeout: number;
  ip_whitelist: IPWhitelistEntry[];
  notification_preferences: NotificationPreferences;
  api_settings: ApiSettings;
}

interface NotificationPreferences {
  email_alerts: boolean;
  sms_alerts: boolean;
  webhook_url: string | null;
}

interface ApiSettings {
  rate_limit: number;
  allowed_origins: string[];
}

interface IPWhitelistEntry {
  ip: string;
  description: string;
  created_at: string;
}

interface Subscription {
  plan: string;
  seats: number;
  used_seats: number;
  billing_cycle: string;
  next_billing_date: string;
  amount: number;
  currency: string;
  status: string;
}

interface Organization {
  id: string;
  name: string;
  subdomain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  settings: OrganizationSettings;
  subscription: Subscription;
}

interface FormData {
  name: string;
  subdomain: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  timezone: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
}

interface SecurityFormData {
  allow_sso: boolean;
  enforce_2fa: boolean;
  session_timeout: number;
}

interface NotificationFormData {
  email_alerts: boolean;
  sms_alerts: boolean;
  webhook_url: string;
}

interface ApiFormData {
  rate_limit: number;
}

interface ValidationErrors {
  [key: string]: string;
}

export function OrganizationSettings() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  // State management
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Form data
  const [formData, setFormData] = useState<FormData>({
    name: '',
    subdomain: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    timezone: '',
    logo_url: '',
    primary_color: '',
    secondary_color: '',
  });

  const [securityData, setSecurityData] = useState<SecurityFormData>({
    allow_sso: false,
    enforce_2fa: false,
    session_timeout: 60,
  });

  const [notificationData, setNotificationData] =
    useState<NotificationFormData>({
      email_alerts: true,
      sms_alerts: false,
      webhook_url: '',
    });

  const [apiData, setApiData] = useState<ApiFormData>({
    rate_limit: 1000,
  });

  // Dialog states
  const [isIPDialogOpen, setIsIPDialogOpen] = useState(false);
  const [isOriginDialogOpen, setIsOriginDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [is2FADialogOpen, setIs2FADialogOpen] = useState(false);
  const [isWebhookTestDialogOpen, setIsWebhookTestDialogOpen] = useState(false);

  // IP Whitelist management
  const [newIP, setNewIP] = useState('');
  const [newIPDescription, setNewIPDescription] = useState('');
  const [ipToRemove, setIPToRemove] = useState<string | null>(null);

  // Origin management
  const [newOrigin, setNewOrigin] = useState('');
  const [originToRemove, setOriginToRemove] = useState<string | null>(null);

  // Deletion confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // Webhook testing
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(
    null
  );
  const [testingWebhook, setTestingWebhook] = useState(false);

  // Access control
  const canEdit = user?.role === 'owner' || user?.role === 'admin';
  const canManageSecurity = user?.role === 'owner' || user?.role === 'admin';
  const canManageBilling = user?.role === 'owner';
  const canDeleteOrg = user?.role === 'owner';
  const isReadOnly = !canEdit;

  // Load organization data
  const fetchOrganization = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/organization');
      const org = response.data.organization;
      setOrganization(org);

      // Populate form data
      setFormData({
        name: org.name || '',
        subdomain: org.subdomain || '',
        contact_email: org.contact_email || '',
        contact_phone: org.contact_phone || '',
        address: org.address || '',
        city: org.city || '',
        state: org.state || '',
        zip: org.zip || '',
        country: org.country || '',
        timezone: org.timezone || '',
        logo_url: org.logo_url || '',
        primary_color: org.primary_color || '#007bff',
        secondary_color: org.secondary_color || '#6c757d',
      });

      setSecurityData({
        allow_sso: org.settings?.allow_sso || false,
        enforce_2fa: org.settings?.enforce_2fa || false,
        session_timeout: Math.floor(
          (org.settings?.session_timeout || 3600) / 60
        ), // Convert to minutes
      });

      setNotificationData({
        email_alerts:
          org.settings?.notification_preferences?.email_alerts || true,
        sms_alerts: org.settings?.notification_preferences?.sms_alerts || false,
        webhook_url: org.settings?.notification_preferences?.webhook_url || '',
      });

      setApiData({
        rate_limit: org.settings?.api_settings?.rate_limit || 1000,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load organization settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket(
      process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
    );

    ws.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.type === 'organization_update') {
        setOrganization(data.organization);
      }
    };

    return () => ws.close();
  }, []);

  // Validation
  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required';
    }

    if (formData.subdomain && !/^[a-z0-9-]+$/.test(formData.subdomain)) {
      newErrors.subdomain =
        'Invalid subdomain format. Only lowercase letters, numbers, and hyphens allowed';
    }

    if (
      formData.contact_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)
    ) {
      newErrors.contact_email = 'Invalid email format';
    }

    if (
      formData.contact_phone &&
      !/^\+?[\d\s\-\(\)]+$/.test(formData.contact_phone)
    ) {
      newErrors.contact_phone = 'Invalid phone format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateIP = (ip: string): boolean => {
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const cidrRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
    return ipRegex.test(ip) || cidrRegex.test(ip);
  };

  const validateURL = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Save handlers
  const handleSaveBasicInfo = async () => {
    if (!canEdit || !validateForm()) return;

    try {
      setSaving(true);
      await api.patch('/api/organization', formData);

      toast({
        title: 'Success',
        description: 'Organization settings saved successfully',
      });

      // Refresh data
      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecuritySettings = async () => {
    if (!canManageSecurity) return;

    try {
      setSaving(true);
      await api.patch('/api/organization/settings', {
        ...securityData,
        session_timeout: securityData.session_timeout * 60, // Convert to seconds
      });

      toast({
        title: 'Success',
        description: 'Security settings saved successfully',
      });

      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save security settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!canEdit) return;

    try {
      setSaving(true);
      await api.patch('/api/organization/notifications', notificationData);

      toast({
        title: 'Success',
        description: 'Notification settings saved successfully',
      });

      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save notification settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAPISettings = async () => {
    if (!canEdit) return;

    try {
      setSaving(true);
      await api.patch('/api/organization/api-settings', apiData);

      toast({
        title: 'Success',
        description: 'API settings saved successfully',
      });

      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save API settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // IP Whitelist management
  const handleAddIP = async () => {
    if (!canManageSecurity || !newIP || !validateIP(newIP)) {
      setErrors({ ...errors, ip: 'Invalid IP address format' });
      return;
    }

    try {
      await api.post('/api/organization/ip-whitelist', {
        ip_address: newIP,
        description: newIPDescription,
      });

      toast({
        title: 'Success',
        description: 'IP address added to whitelist',
      });

      setNewIP('');
      setNewIPDescription('');
      setIsIPDialogOpen(false);
      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add IP address.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveIP = async (ip: string) => {
    if (!canManageSecurity) return;

    try {
      await api.delete(
        `/api/organization/ip-whitelist/${encodeURIComponent(ip)}`
      );

      toast({
        title: 'Success',
        description: 'IP address removed from whitelist',
      });

      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove IP address.',
        variant: 'destructive',
      });
    }
  };

  // Origin management
  const handleAddOrigin = async () => {
    if (!canEdit || !newOrigin || !validateURL(newOrigin)) {
      setErrors({ ...errors, origin: 'Invalid URL format' });
      return;
    }

    try {
      await api.post('/api/organization/allowed-origins', {
        origin: newOrigin,
      });

      toast({
        title: 'Success',
        description: 'Origin added successfully',
      });

      setNewOrigin('');
      setIsOriginDialogOpen(false);
      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add origin.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveOrigin = async (origin: string) => {
    if (!canEdit) return;

    try {
      await api.delete(
        `/api/organization/allowed-origins/${encodeURIComponent(origin)}`
      );

      toast({
        title: 'Success',
        description: 'Origin removed successfully',
      });

      fetchOrganization();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove origin.',
        variant: 'destructive',
      });
    }
  };

  // Webhook testing
  const handleTestWebhook = async () => {
    if (!notificationData.webhook_url) return;

    try {
      setTestingWebhook(true);
      await api.post('/api/organization/test-webhook', {
        url: notificationData.webhook_url,
      });

      setWebhookTestResult('Webhook test successful');
      toast({
        title: 'Success',
        description: 'Webhook test successful',
      });
    } catch (error) {
      setWebhookTestResult('Webhook test failed');
      toast({
        title: 'Error',
        description: 'Webhook test failed',
        variant: 'destructive',
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  // Billing management
  const handleManageBilling = async () => {
    if (!canManageBilling) return;

    try {
      const response = await api.post('/api/organization/billing-portal');
      // Redirect to billing portal
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to access billing portal.',
        variant: 'destructive',
      });
    }
  };

  // Organization deletion
  const handleDeleteOrganization = async () => {
    if (!canDeleteOrg || deleteConfirmation !== 'DELETE') return;

    try {
      setSaving(true);
      await api.delete('/api/organization');

      toast({
        title: 'Organization deleted',
        description: 'Your organization has been permanently deleted.',
      });

      // Redirect or handle post-deletion logic
      window.location.href = '/';
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete organization.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // 2FA enforcement handler
  const handleEnforce2FA = () => {
    if (!securityData.enforce_2fa) {
      setSecurityData(prev => ({ ...prev, enforce_2fa: true }));
      handleSaveSecuritySettings();
    } else {
      setIs2FADialogOpen(true);
    }
  };

  const confirmEnforce2FA = () => {
    setSecurityData(prev => ({ ...prev, enforce_2fa: true }));
    setIs2FADialogOpen(false);
    handleSaveSecuritySettings();
  };

  if (loading) {
    return (
      <div
        className='flex items-center justify-center p-8'
        data-testid='organization-loading'
      >
        <RefreshCw className='h-6 w-6 animate-spin mr-2' />
        <span>Loading organization settings...</span>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className='flex flex-col items-center justify-center p-8'>
        <Alert className='max-w-md'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            Failed to load organization settings. Please try again.
          </AlertDescription>
        </Alert>
        <Button onClick={fetchOrganization} className='mt-4'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <main className='space-y-6' role='main' aria-label='Organization Settings'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>
          Organization Settings
        </h1>
        <p className='text-muted-foreground'>
          Manage your organization profile and preferences
        </p>
        {isReadOnly && (
          <Alert className='mt-4'>
            <Eye className='h-4 w-4' />
            <AlertDescription>
              Read-only mode: You don't have permission to edit these settings.
              Contact an admin for access.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building2 className='h-5 w-5' />
            Basic Information
          </CardTitle>
          <CardDescription>
            Your organization's basic details and contact information
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='org-name'>
                Organization Name
                <span className='text-red-500 ml-1'>*</span>
              </Label>
              <Input
                id='org-name'
                value={formData.name}
                onChange={e =>
                  setFormData(prev => ({ ...prev, name: e.target.value }))
                }
                disabled={isReadOnly}
                className={errors.name ? 'border-red-500' : ''}
                aria-required='true'
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <p id='name-error' className='text-sm text-red-500 mt-1'>
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor='subdomain'>Subdomain</Label>
              <Input
                id='subdomain'
                value={formData.subdomain}
                onChange={e =>
                  setFormData(prev => ({ ...prev, subdomain: e.target.value }))
                }
                disabled={isReadOnly}
                placeholder='your-org'
                className={errors.subdomain ? 'border-red-500' : ''}
                aria-invalid={!!errors.subdomain}
                aria-describedby={
                  errors.subdomain ? 'subdomain-error' : undefined
                }
              />
              {errors.subdomain && (
                <p id='subdomain-error' className='text-sm text-red-500 mt-1'>
                  {errors.subdomain}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor='contact-email'>Contact Email</Label>
              <Input
                id='contact-email'
                type='email'
                value={formData.contact_email}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    contact_email: e.target.value,
                  }))
                }
                disabled={isReadOnly}
                className={errors.contact_email ? 'border-red-500' : ''}
                aria-invalid={!!errors.contact_email}
                aria-describedby={
                  errors.contact_email ? 'email-error' : undefined
                }
              />
              {errors.contact_email && (
                <p id='email-error' className='text-sm text-red-500 mt-1'>
                  {errors.contact_email}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor='contact-phone'>Contact Phone</Label>
              <Input
                id='contact-phone'
                type='tel'
                value={formData.contact_phone}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    contact_phone: e.target.value,
                  }))
                }
                disabled={isReadOnly}
                className={errors.contact_phone ? 'border-red-500' : ''}
                aria-invalid={!!errors.contact_phone}
                aria-describedby={
                  errors.contact_phone ? 'phone-error' : undefined
                }
              />
              {errors.contact_phone && (
                <p id='phone-error' className='text-sm text-red-500 mt-1'>
                  {errors.contact_phone}
                </p>
              )}
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='address'>Address</Label>
              <Input
                id='address'
                value={formData.address}
                onChange={e =>
                  setFormData(prev => ({ ...prev, address: e.target.value }))
                }
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor='city'>City</Label>
              <Input
                id='city'
                value={formData.city}
                onChange={e =>
                  setFormData(prev => ({ ...prev, city: e.target.value }))
                }
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor='state'>State/Province</Label>
              <Input
                id='state'
                value={formData.state}
                onChange={e =>
                  setFormData(prev => ({ ...prev, state: e.target.value }))
                }
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor='zip'>ZIP/Postal Code</Label>
              <Input
                id='zip'
                value={formData.zip}
                onChange={e =>
                  setFormData(prev => ({ ...prev, zip: e.target.value }))
                }
                disabled={isReadOnly}
              />
            </div>
          </div>

          {canEdit && (
            <Button onClick={handleSaveBasicInfo} disabled={saving}>
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Palette className='h-5 w-5' />
            Branding
          </CardTitle>
          <CardDescription>
            Customize your organization's visual identity
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <Label htmlFor='logo-url'>Logo URL</Label>
            <Input
              id='logo-url'
              type='url'
              value={formData.logo_url}
              onChange={e =>
                setFormData(prev => ({ ...prev, logo_url: e.target.value }))
              }
              disabled={isReadOnly}
              placeholder='https://example.com/logo.png'
            />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='primary-color'>Primary Color</Label>
              <div className='flex gap-2'>
                <Input
                  id='primary-color'
                  type='color'
                  value={formData.primary_color}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      primary_color: e.target.value,
                    }))
                  }
                  disabled={isReadOnly}
                  className='w-16 h-10 p-1'
                />
                <Input
                  type='text'
                  value={formData.primary_color}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      primary_color: e.target.value,
                    }))
                  }
                  disabled={isReadOnly}
                  className='flex-1'
                />
              </div>
            </div>

            <div>
              <Label htmlFor='secondary-color'>Secondary Color</Label>
              <div className='flex gap-2'>
                <Input
                  id='secondary-color'
                  type='color'
                  value={formData.secondary_color}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      secondary_color: e.target.value,
                    }))
                  }
                  disabled={isReadOnly}
                  className='w-16 h-10 p-1'
                />
                <Input
                  type='text'
                  value={formData.secondary_color}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      secondary_color: e.target.value,
                    }))
                  }
                  disabled={isReadOnly}
                  className='flex-1'
                />
              </div>
            </div>
          </div>

          <div className='p-4 border rounded-lg'>
            <p className='text-sm text-muted-foreground mb-2'>Preview:</p>
            <div
              className='w-16 h-16 rounded-lg border'
              style={{ backgroundColor: formData.primary_color }}
              data-testid='color-preview'
              aria-label={`Color preview: ${formData.primary_color}`}
            />
          </div>

          {canEdit && (
            <Button onClick={handleSaveBasicInfo} disabled={saving}>
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Security Settings */}
      {canManageSecurity && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Security
            </CardTitle>
            <CardDescription>
              Manage authentication and access control settings
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <Label htmlFor='enable-sso'>Enable SSO</Label>
                <p className='text-sm text-muted-foreground'>
                  Allow single sign-on authentication
                </p>
              </div>
              <Checkbox
                id='enable-sso'
                checked={securityData.allow_sso}
                onCheckedChange={checked =>
                  setSecurityData(prev => ({
                    ...prev,
                    allow_sso: checked as boolean,
                  }))
                }
                disabled={isReadOnly}
              />
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <Label htmlFor='enforce-2fa'>Enforce 2FA</Label>
                <p className='text-sm text-muted-foreground'>
                  Require all users to enable two-factor authentication
                </p>
              </div>
              <Checkbox
                id='enforce-2fa'
                checked={securityData.enforce_2fa}
                onCheckedChange={handleEnforce2FA}
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor='session-timeout'>Session Timeout (minutes)</Label>
              <Input
                id='session-timeout'
                type='number'
                value={securityData.session_timeout}
                onChange={e =>
                  setSecurityData(prev => ({
                    ...prev,
                    session_timeout: parseInt(e.target.value) || 60,
                  }))
                }
                disabled={isReadOnly}
                min='5'
                max='1440'
                className='w-32'
              />
            </div>

            <Button
              onClick={handleSaveSecuritySettings}
              disabled={saving || isReadOnly}
            >
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* IP Whitelist */}
      {canManageSecurity && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Network className='h-5 w-5' />
              IP Whitelist
            </CardTitle>
            <CardDescription>
              Restrict access to specific IP addresses or ranges
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex justify-between items-center'>
              <p className='text-sm text-muted-foreground'>
                {organization.settings?.ip_whitelist?.length || 0} IP addresses
                whitelisted
              </p>
              <Button
                onClick={() => setIsIPDialogOpen(true)}
                disabled={isReadOnly}
                size='sm'
              >
                <Plus className='h-4 w-4 mr-2' />
                Add IP Address
              </Button>
            </div>

            {organization.settings?.ip_whitelist?.length > 0 && (
              <div className='space-y-2'>
                {organization.settings.ip_whitelist.map(entry => (
                  <div
                    key={entry.ip}
                    className='flex items-center justify-between p-3 border rounded-lg'
                  >
                    <div>
                      <p className='font-medium'>{entry.ip}</p>
                      {entry.description && (
                        <p className='text-sm text-muted-foreground'>
                          {entry.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => handleRemoveIP(entry.ip)}
                      disabled={isReadOnly}
                      className='text-red-600 hover:text-red-700'
                    >
                      <Trash2 className='h-4 w-4' />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Mail className='h-5 w-5' />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure how you receive alerts and updates
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <Label htmlFor='email-alerts'>Email Alerts</Label>
              <p className='text-sm text-muted-foreground'>
                Receive notifications via email
              </p>
            </div>
            <Checkbox
              id='email-alerts'
              checked={notificationData.email_alerts}
              onCheckedChange={checked =>
                setNotificationData(prev => ({
                  ...prev,
                  email_alerts: checked as boolean,
                }))
              }
              disabled={isReadOnly}
            />
          </div>

          <div className='flex items-center justify-between'>
            <div>
              <Label htmlFor='sms-alerts'>SMS Alerts</Label>
              <p className='text-sm text-muted-foreground'>
                Receive notifications via SMS
              </p>
            </div>
            <Checkbox
              id='sms-alerts'
              checked={notificationData.sms_alerts}
              onCheckedChange={checked =>
                setNotificationData(prev => ({
                  ...prev,
                  sms_alerts: checked as boolean,
                }))
              }
              disabled={isReadOnly}
            />
          </div>

          <div>
            <Label htmlFor='webhook-url'>Webhook URL</Label>
            <div className='flex gap-2'>
              <Input
                id='webhook-url'
                type='url'
                value={notificationData.webhook_url}
                onChange={e =>
                  setNotificationData(prev => ({
                    ...prev,
                    webhook_url: e.target.value,
                  }))
                }
                disabled={isReadOnly}
                placeholder='https://your-webhook.example.com/notify'
                className='flex-1'
              />
              <Button
                variant='outline'
                onClick={handleTestWebhook}
                disabled={
                  isReadOnly || !notificationData.webhook_url || testingWebhook
                }
                size='sm'
              >
                <TestTube className='h-4 w-4 mr-2' />
                Test Webhook
              </Button>
            </div>
            {webhookTestResult && (
              <p
                className={`text-sm mt-1 ${
                  webhookTestResult.includes('successful')
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {webhookTestResult}
              </p>
            )}
          </div>

          {canEdit && (
            <Button onClick={handleSaveNotifications} disabled={saving}>
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* API Settings */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <SettingsIcon className='h-5 w-5' />
            API Settings
          </CardTitle>
          <CardDescription>
            Configure API access and rate limiting
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <Label htmlFor='rate-limit'>Rate Limit (requests per hour)</Label>
            <Input
              id='rate-limit'
              type='number'
              value={apiData.rate_limit}
              onChange={e =>
                setApiData(prev => ({
                  ...prev,
                  rate_limit: parseInt(e.target.value) || 1000,
                }))
              }
              disabled={isReadOnly}
              min='100'
              max='100000'
              className='w-40'
            />
          </div>

          <div>
            <div className='flex justify-between items-center mb-2'>
              <Label>Allowed Origins</Label>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setIsOriginDialogOpen(true)}
                disabled={isReadOnly}
              >
                <Plus className='h-4 w-4 mr-2' />
                Add Origin
              </Button>
            </div>

            {organization.settings?.api_settings?.allowed_origins?.length >
              0 && (
              <div className='space-y-2'>
                {organization.settings.api_settings.allowed_origins.map(
                  origin => (
                    <div
                      key={origin}
                      className='flex items-center justify-between p-2 border rounded'
                    >
                      <span className='font-mono text-sm'>{origin}</span>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => handleRemoveOrigin(origin)}
                        disabled={isReadOnly}
                        className='text-red-600'
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <Button onClick={handleSaveAPISettings} disabled={saving}>
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Subscription Information */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <CreditCard className='h-5 w-5' />
            Subscription
          </CardTitle>
          <CardDescription>
            Your current plan and billing information
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <p className='text-sm font-medium'>
                Plan:{' '}
                <span className='capitalize'>
                  {organization.subscription?.plan || 'Free'}
                </span>
              </p>
              <p className='text-sm text-muted-foreground'>
                {organization.subscription?.used_seats || 0} /{' '}
                {organization.subscription?.seats || 0} seats used
              </p>
            </div>

            <div>
              <p className='text-sm font-medium'>
                ${organization.subscription?.amount || 0}{' '}
                {organization.subscription?.currency || 'USD'} /{' '}
                {organization.subscription?.billing_cycle || 'month'}
              </p>
              {organization.subscription?.next_billing_date && (
                <p className='text-sm text-muted-foreground'>
                  Next billing:{' '}
                  {new Date(
                    organization.subscription.next_billing_date
                  ).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>

          <div className='flex gap-2'>
            {organization.subscription?.plan !== 'enterprise' && (
              <Button variant='outline'>Upgrade Plan</Button>
            )}

            {canManageBilling && (
              <Button onClick={handleManageBilling}>
                <CreditCard className='h-4 w-4 mr-2' />
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {canDeleteOrg && (
        <Card className='border-red-200'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-red-600'>
              <AlertTriangle className='h-5 w-5' />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex items-center justify-between p-4 border border-red-200 rounded-lg'>
              <div>
                <p className='font-medium text-red-600'>Delete Organization</p>
                <p className='text-sm text-muted-foreground'>
                  Permanently delete this organization and all associated data
                </p>
              </div>
              <Button
                variant='destructive'
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete Organization
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}

      {/* IP Address Dialog */}
      <Dialog open={isIPDialogOpen} onOpenChange={setIsIPDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add IP Address</DialogTitle>
            <DialogDescription>
              Add an IP address or CIDR range to the whitelist
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='new-ip'>IP Address</Label>
              <Input
                id='new-ip'
                value={newIP}
                onChange={e => setNewIP(e.target.value)}
                placeholder='192.168.1.100 or 192.168.1.0/24'
                className={errors.ip ? 'border-red-500' : ''}
              />
              {errors.ip && (
                <p className='text-sm text-red-500 mt-1'>{errors.ip}</p>
              )}
            </div>
            <div>
              <Label htmlFor='ip-description'>Description</Label>
              <Input
                id='ip-description'
                value={newIPDescription}
                onChange={e => setNewIPDescription(e.target.value)}
                placeholder='Office network'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsIPDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddIP}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Origin Dialog */}
      <Dialog open={isOriginDialogOpen} onOpenChange={setIsOriginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Allowed Origin</DialogTitle>
            <DialogDescription>
              Add a domain that can make API requests
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor='new-origin'>Origin URL</Label>
            <Input
              id='new-origin'
              value={newOrigin}
              onChange={e => setNewOrigin(e.target.value)}
              placeholder='https://app.example.com'
              className={errors.origin ? 'border-red-500' : ''}
            />
            {errors.origin && (
              <p className='text-sm text-red-500 mt-1'>{errors.origin}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsOriginDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddOrigin}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA Enforcement Confirmation */}
      <AlertDialog open={is2FADialogOpen} onOpenChange={setIs2FADialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enforce Two-Factor Authentication
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will require all users to enable 2FA before they can access
              the system. Users without 2FA will be prompted to set it up on
              their next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnforce2FA}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* IP Remove Confirmation */}
      <AlertDialog
        open={!!ipToRemove}
        onOpenChange={open => !open && setIPToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove IP Address</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this IP address from the
              whitelist? This may prevent users from accessing the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (ipToRemove) handleRemoveIP(ipToRemove);
                setIPToRemove(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Organization Deletion Confirmation */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              organization and all associated data including users, devices, and
              diagnostic sessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='my-4'>
            <Label htmlFor='delete-confirmation'>
              Type "DELETE" to confirm
            </Label>
            <Input
              id='delete-confirmation'
              value={deleteConfirmation}
              onChange={e => setDeleteConfirmation(e.target.value)}
              placeholder='Type DELETE'
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrganization}
              disabled={deleteConfirmation !== 'DELETE' || saving}
              className='bg-red-600 hover:bg-red-700'
            >
              {saving ? 'Deleting...' : 'Confirm Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success/Error Toast Container */}
      <div
        role='alert'
        aria-live='polite'
        className='sr-only'
        id='toast-announcements'
      >
        {/* Toast messages will be announced here for screen readers */}
      </div>
    </main>
  );
}
