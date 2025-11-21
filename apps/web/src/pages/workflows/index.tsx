import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type {Workflow} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {Edit, Plus, Power, PowerOff, Search, Trash2, Workflow as WorkflowIcon} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

interface PaginatedWorkflows {
  workflows: (Workflow & {_count?: {steps: number; executions: number}})[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function WorkflowsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const {data, mutate, isLoading} = useSWR<PaginatedWorkflows>(
    `/workflows?page=${page}&pageSize=20${search ? `&search=${search}` : ''}`,
    {revalidateOnFocus: false},
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/workflows/${workflowId}`);
      toast.success('Workflow deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete workflow');
    }
  };

  const handleToggleEnabled = async (workflowId: string, currentlyEnabled: boolean) => {
    try {
      await network.fetch('PATCH', `/workflows/${workflowId}`, {
        enabled: !currentlyEnabled,
      });
      toast.success(`Workflow ${!currentlyEnabled ? 'enabled' : 'disabled'} successfully`);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle workflow');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Workflows</h1>
            <p className="text-neutral-500 mt-2">
              Automate your email campaigns with powerful workflows.{' '}
              {data?.total ? `${data.total} total workflows` : ''}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <Input
                  type="text"
                  placeholder="Search workflows..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit">Search</Button>
              {search && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setSearchInput('');
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Workflows Grid */}
        <div className="grid gap-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <svg
                      className="h-8 w-8 animate-spin mx-auto text-neutral-900"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <p className="mt-2 text-sm text-neutral-500">Loading workflows...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : data?.workflows.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <WorkflowIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No workflows found</h3>
                  <p className="text-neutral-500 mb-6">
                    {search ? 'Try adjusting your search terms' : 'Get started by creating your first workflow'}
                  </p>
                  {!search && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4" />
                      Create Workflow
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {data?.workflows.map(workflow => (
                <Card key={workflow.id} className={workflow.enabled ? 'border-green-200' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CardTitle>{workflow.name}</CardTitle>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              workflow.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {workflow.enabled ? (
                              <>
                                <Power className="h-3 w-3 mr-1" />
                                Active
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-3 w-3 mr-1" />
                                Disabled
                              </>
                            )}
                          </span>
                          {workflow.triggerConfig &&
                            typeof workflow.triggerConfig === 'object' &&
                            'eventName' in workflow.triggerConfig && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {String(workflow.triggerConfig.eventName)}
                              </span>
                            )}
                        </div>
                        {workflow.description && (
                          <CardDescription className="mt-2">{workflow.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleEnabled(workflow.id, workflow.enabled)}
                        >
                          {workflow.enabled ? (
                            <PowerOff className="h-4 w-4 text-orange-600" />
                          ) : (
                            <Power className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Link href={`/workflows/${workflow.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(workflow.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm text-neutral-500">
                      <div>
                        <span className="font-medium text-neutral-900">{workflow._count?.steps ?? 0}</span> steps
                      </div>
                      <div>
                        <span className="font-medium text-neutral-900">{workflow._count?.executions ?? 0}</span>{' '}
                        executions
                      </div>
                      <div>Created {new Date(workflow.createdAt).toLocaleDateString()}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-neutral-500">
                    Showing {(page - 1) * data.pageSize + 1} to {Math.min(page * data.pageSize, data.total)} of{' '}
                    {data.total} workflows
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm text-neutral-700">
                      Page {page} of {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page === data.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Workflow Dialog */}
      <CreateWorkflowDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />
    </DashboardLayout>
  );
}

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateWorkflowDialog({open, onOpenChange, onSuccess}: CreateWorkflowDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventName, setEventName] = useState('');
  const [allowReentry, setAllowReentry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available event names
  const {data: eventNamesData} = useSWR<{eventNames: string[]}>(open ? '/events/names' : null, {
    revalidateOnFocus: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const workflow = await network.fetch<Workflow>('POST', '/workflows', {
        name,
        description: description || undefined,
        eventName: eventName.trim(),
        enabled: false,
        allowReentry,
      });

      toast.success('Workflow created successfully');
      setName('');
      setDescription('');
      setEventName('');
      setAllowReentry(false);
      onOpenChange(false);
      onSuccess();

      // Redirect to the workflow editor
      window.location.href = `/workflows/${workflow.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create workflow');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Welcome Email Sequence"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Send a series of welcome emails to new subscribers"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="eventName">Trigger Event *</Label>
            {eventNamesData?.eventNames && eventNamesData.eventNames.length > 0 ? (
              <Select value={eventName} onValueChange={setEventName} required>
                <SelectTrigger id="eventName">
                  <SelectValue placeholder="Select an event..." />
                </SelectTrigger>
                <SelectContent>
                  {eventNamesData.eventNames.map(name => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="eventName"
                type="text"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                required
                placeholder="e.g., contact.created, email.opened"
              />
            )}
            <p className="text-xs text-neutral-500 mt-1">
              {eventNamesData?.eventNames && eventNamesData.eventNames.length > 0
                ? 'Select from previously tracked events'
                : 'No events tracked yet. Enter the event name that will trigger this workflow.'}
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <input
              id="allowReentry"
              type="checkbox"
              checked={allowReentry}
              onChange={e => setAllowReentry(e.target.checked)}
              className="mt-1 h-4 w-4 text-neutral-900 focus:ring-neutral-900 border-neutral-300 rounded"
            />
            <div className="flex-1">
              <Label htmlFor="allowReentry" className="font-medium cursor-pointer">
                Allow Re-entry
              </Label>
              <p className="text-xs text-neutral-500 mt-1">
                When enabled, contacts can enter this workflow multiple times. When disabled, contacts can only enter
                once, ever.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
