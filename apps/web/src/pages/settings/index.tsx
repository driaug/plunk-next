import {useEffect, useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {ProjectSchemas} from '@repo/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {AlertTriangle, CreditCard, Globe, Settings as SettingsIcon} from 'lucide-react';
import type {z} from 'zod';
import {useRouter} from 'next/router';
import {DashboardLayout} from '../../components/DashboardLayout';
import {DomainsSettings} from '../../components/DomainsSettings';
import {ApiKeyDisplay} from '../../components/ApiKeyDisplay';
import {useActiveProject} from '../../lib/contexts/ActiveProjectProvider';
import {network} from '../../lib/network';
import {useProjects} from '../../lib/hooks/useProject';

type TabId = 'general' | 'billing' | 'domains';

interface Tab {
  id: TabId;
  label: string;
  icon: typeof SettingsIcon;
}

const tabs: Tab[] = [
  {id: 'general', label: 'General', icon: SettingsIcon},
  {id: 'billing', label: 'Billing', icon: CreditCard},
  {id: 'domains', label: 'Domains', icon: Globe},
];

export default function Settings() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('general');

  // Set initial tab from URL parameter
  useEffect(() => {
    if (router.query.tab && typeof router.query.tab === 'string') {
      const tab = router.query.tab as TabId;
      if (tabs.some(t => t.id === tab)) {
        setActiveTab(tab);
      }
    }
  }, [router.query.tab]);
  const {activeProject, setActiveProject} = useActiveProject();
  const {mutate: projectsMutate} = useProjects();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [keyToRegenerate, setKeyToRegenerate] = useState<'both' | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);

  // Handle Stripe redirect success/cancel messages
  useEffect(() => {
    if (router.query.success === 'true') {
      setSuccessMessage('Subscription activated successfully! It may take a moment to update.');
      setTimeout(() => {
        setSuccessMessage(null);
        // Remove query params from URL
        router.replace('/settings?tab=billing', undefined, {shallow: true});
      }, 5000);
    } else if (router.query.canceled === 'true') {
      setErrorMessage('Checkout was canceled. You can try again anytime.');
      setTimeout(() => {
        setErrorMessage(null);
        // Remove query params from URL
        router.replace('/settings?tab=billing', undefined, {shallow: true});
      }, 5000);
    }
  }, [router]);

  const form = useForm<z.infer<typeof ProjectSchemas.update>>({
    resolver: zodResolver(ProjectSchemas.update),
    defaultValues: {
      name: activeProject?.name || '',
    },
  });

  // Update form when active project changes
  useEffect(() => {
    if (activeProject) {
      form.reset({name: activeProject.name});
    }
  }, [activeProject, form]);

  const onSubmit = async (values: z.infer<typeof ProjectSchemas.update>) => {
    if (!activeProject) return;

    try {
      setErrorMessage(null);
      setSuccessMessage(null);

      const updatedProject = await network.fetch<typeof activeProject, typeof ProjectSchemas.update>(
        'PATCH',
        `/users/@me/projects/${activeProject.id}`,
        values,
      );

      // Update the active project in context
      setActiveProject(updatedProject);

      // Refresh projects list
      await projectsMutate();

      setSuccessMessage('Project settings updated successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update project settings');
    }
  };

  const handleRegenerateKeys = async () => {
    if (!activeProject) return;

    try {
      setErrorMessage(null);
      setSuccessMessage(null);

      const updatedProject = await network.fetch<typeof activeProject>(
        'POST',
        `/users/@me/projects/${activeProject.id}/regenerate-keys`,
      );

      // Update the active project in context
      setActiveProject(updatedProject);

      // Refresh projects list
      await projectsMutate();

      setSuccessMessage('API keys regenerated successfully');
      setShowRegenerateDialog(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to regenerate API keys');
      setShowRegenerateDialog(false);
    }
  };

  const promptRegenerateKeys = () => {
    setKeyToRegenerate('both');
    setShowRegenerateDialog(true);
  };

  const handleStartSubscription = async () => {
    if (!activeProject) return;

    try {
      setIsLoadingBilling(true);
      setErrorMessage(null);

      const response = await network.fetch<{url: string}>('POST', `/users/@me/projects/${activeProject.id}/checkout`);

      // Redirect to Stripe checkout
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start checkout');
      setIsLoadingBilling(false);
    }
  };

  const handleManageBilling = async () => {
    if (!activeProject) return;

    try {
      setIsLoadingBilling(true);
      setErrorMessage(null);

      const response = await network.fetch<{url: string}>(
        'POST',
        `/users/@me/projects/${activeProject.id}/billing-portal`,
      );

      // Redirect to Stripe billing portal
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open billing portal');
      setIsLoadingBilling(false);
    }
  };

  if (!activeProject) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-neutral-500">No project selected</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Settings</h1>
          <p className="text-neutral-500 mt-2">Manage your project settings and preferences</p>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-neutral-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${
                      isActive
                        ? 'border-neutral-900 text-neutral-900'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                    }
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="max-w-4xl">
          {/* General Tab */}
          {activeTab === 'general' && (
            <Card>
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>Update your project name and basic information</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Project Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Awesome Project" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* API Keys */}
                    <div className="space-y-4 pt-4 border-t border-neutral-200">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-neutral-900">API Keys</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={promptRegenerateKeys}
                          className="text-xs"
                        >
                          Regenerate Keys
                        </Button>
                      </div>
                      <ApiKeyDisplay
                        label="Public API Key"
                        value={activeProject.public}
                        description="Use this key for client-side integrations"
                      />
                      <ApiKeyDisplay
                        label="Secret API Key"
                        value={activeProject.secret}
                        description="Keep this key secure and never expose it publicly"
                        isSecret
                      />
                    </div>

                    {/* Success/Error Messages */}
                    <AnimatePresence mode="wait">
                      {successMessage && (
                        <motion.div
                          initial={{opacity: 0, y: -10}}
                          animate={{opacity: 1, y: 0}}
                          exit={{opacity: 0}}
                          className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
                        >
                          {successMessage}
                        </motion.div>
                      )}
                      {errorMessage && (
                        <motion.div
                          initial={{opacity: 0, y: -10}}
                          animate={{opacity: 1, y: 0}}
                          exit={{opacity: 0}}
                          className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                        >
                          {errorMessage}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <Card>
              <CardHeader>
                <CardTitle>Billing & Subscription</CardTitle>
                <CardDescription>Manage your subscription and billing information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Success/Error Messages */}
                  <AnimatePresence mode="wait">
                    {successMessage && (
                      <motion.div
                        initial={{opacity: 0, y: -10}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0}}
                        className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800"
                      >
                        {successMessage}
                      </motion.div>
                    )}
                    {errorMessage && (
                      <motion.div
                        initial={{opacity: 0, y: -10}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0}}
                        className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                      >
                        {errorMessage}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {activeProject.subscription ? (
                    // Has subscription - show billing portal button
                    <div className="space-y-4">
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-800 mb-2">
                          <CreditCard className="h-5 w-5" />
                          <span className="font-medium">Active Subscription</span>
                        </div>
                        <p className="text-sm text-green-700">
                          Your subscription is active. Manage your billing details, update payment methods, or cancel
                          your subscription through the billing portal.
                        </p>
                      </div>

                      <div className="flex justify-start">
                        <Button onClick={handleManageBilling} disabled={isLoadingBilling}>
                          {isLoadingBilling ? 'Loading...' : 'Manage Billing'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // No subscription - show start subscription button
                    <div className="space-y-4">
                      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <div className="flex items-center gap-2 text-neutral-800 mb-2">
                          <CreditCard className="h-5 w-5" />
                          <span className="font-medium">No Active Subscription</span>
                        </div>
                        <p className="text-sm text-neutral-600">
                          Start a subscription to unlock premium features and support the development of Plunk.
                        </p>
                      </div>

                      <div className="flex justify-start">
                        <Button onClick={handleStartSubscription} disabled={isLoadingBilling}>
                          {isLoadingBilling ? 'Loading...' : 'Start Subscription'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Domains Tab */}
          {activeTab === 'domains' && <DomainsSettings projectId={activeProject.id} />}
        </div>
      </div>

      {/* Regenerate Keys Confirmation Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Regenerate API Keys
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Are you sure you want to regenerate your API keys?</p>
              <Alert className="bg-orange-50 border-orange-200 text-orange-900 text-xs">
                <AlertTriangle className="h-4 w-4" />
                <div className="ml-2">
                  <strong>Warning:</strong> This action will immediately invalidate your current API keys. Any
                  applications using the old keys will stop working until you update them with the new keys.
                </div>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleRegenerateKeys} className="bg-orange-600 hover:bg-orange-700">
              Regenerate Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
