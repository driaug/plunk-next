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
import type {Template, Workflow, WorkflowExecution, WorkflowStep} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {
  ArrowLeft,
  Clock,
  GitBranch,
  LogOut,
  Mail,
  Play,
  Plus,
  Power,
  PowerOff,
  Settings,
  Trash2,
  UserCog,
  Users,
  Webhook,
} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {WorkflowBuilder} from '../../components/WorkflowBuilder';
import {ReactFlowProvider} from '@xyflow/react';

interface WorkflowWithDetails extends Workflow {
  steps: (WorkflowStep & {
    template?: {id: string; name: string} | null;
    outgoingTransitions: any[];
    incomingTransitions: any[];
  })[];
}

interface PaginatedExecutions {
  executions: (WorkflowExecution & {
    contact: {id: string; email: string};
    currentStep?: {id: string; name: string; type: string} | null;
  })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STEP_TYPE_ICONS = {
  TRIGGER: GitBranch,
  SEND_EMAIL: Mail,
  DELAY: Clock,
  WAIT_FOR_EVENT: Clock,
  CONDITION: GitBranch,
  EXIT: LogOut,
  WEBHOOK: Webhook,
  UPDATE_CONTACT: UserCog,
};

const STEP_TYPE_COLORS = {
  TRIGGER: 'text-purple-600',
  SEND_EMAIL: 'text-blue-600',
  DELAY: 'text-orange-600',
  WAIT_FOR_EVENT: 'text-yellow-600',
  CONDITION: 'text-purple-600',
  EXIT: 'text-red-600',
  WEBHOOK: 'text-green-600',
  UPDATE_CONTACT: 'text-indigo-600',
};

export default function WorkflowEditorPage() {
  const router = useRouter();
  const {id} = router.query;
  const [activeTab, setActiveTab] = useState<'builder' | 'executions'>('builder');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);

  const {data: workflow, mutate} = useSWR<WorkflowWithDetails>(id ? `/workflows/${id}` : null, {
    revalidateOnFocus: false,
  });

  const {data: executionsData} = useSWR<PaginatedExecutions>(
    id && activeTab === 'executions' ? `/workflows/${id}/executions?page=1&pageSize=10` : null,
    {revalidateOnFocus: false},
  );

  const handleToggleEnabled = async () => {
    if (!workflow) return;

    try {
      await network.fetch('PATCH', `/workflows/${id}`, {
        enabled: !workflow.enabled,
      });
      toast.success(`Workflow ${!workflow.enabled ? 'enabled' : 'disabled'} successfully`);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle workflow');
    }
  };

  const handleUpdateSettings = async (data: {name: string; description?: string}) => {
    try {
      await network.fetch('PATCH', `/workflows/${id}`, data);
      toast.success('Workflow updated successfully');
      void mutate();
      setShowSettingsDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workflow');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/workflows/${id}/steps/${stepId}`);
      toast.success('Step deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete step');
    }
  };

  const handleEditStep = (step: WorkflowStep) => {
    setEditingStep(step);
  };

  // Listen for edit step events from the WorkflowBuilder
  useEffect(() => {
    const handleEditStepEvent = (event: any) => {
      const stepId = event.detail?.stepId;
      if (stepId && workflow) {
        const step = workflow.steps.find(s => s.id === stepId);
        if (step) {
          setEditingStep(step);
        }
      }
    };

    window.addEventListener('workflow-edit-step', handleEditStepEvent);
    return () => {
      window.removeEventListener('workflow-edit-step', handleEditStepEvent);
    };
  }, [workflow]);

  if (!workflow) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
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
            <p className="mt-2 text-sm text-neutral-500">Loading workflow...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/workflows">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-neutral-900">{workflow.name}</h1>
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
              </div>
              {workflow.description && <p className="text-neutral-500 mt-1">{workflow.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowTestDialog(true)}>
              <Play className="h-4 w-4" />
              Test
            </Button>
            <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button onClick={handleToggleEnabled}>
              {workflow.enabled ? (
                <>
                  <PowerOff className="h-4 w-4" />
                  Disable
                </>
              ) : (
                <>
                  <Power className="h-4 w-4" />
                  Enable
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('builder')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'builder'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              Workflow Builder
            </button>
            <button
              onClick={() => setActiveTab('executions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'executions'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              Executions
            </button>
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => setActiveTab('debug' as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'debug'
                    ? 'border-neutral-900 text-neutral-900'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                Debug
              </button>
            )}
          </nav>
        </div>

        {/* Content */}
        {activeTab === 'builder' ? (
          <Card>
            <CardHeader>
              <CardTitle>Workflow Builder</CardTitle>
              <CardDescription>
                Click the <strong>+</strong> buttons to add and connect steps to your workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ReactFlowProvider>
                <WorkflowBuilder workflowId={id as string} steps={workflow.steps} onUpdate={() => mutate()} />
              </ReactFlowProvider>
            </CardContent>
          </Card>
        ) : activeTab === 'executions' ? (
          <Card>
            <CardHeader>
              <CardTitle>Workflow Executions</CardTitle>
              <CardDescription>View all executions of this workflow</CardDescription>
            </CardHeader>
            <CardContent>
              {!executionsData?.executions.length ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No executions yet</h3>
                  <p className="text-neutral-500 mb-6">
                    This workflow hasn't been executed yet. Enable it to start processing contacts.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Current Step
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Started
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {executionsData.executions.map(execution => (
                        <tr key={execution.id} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                            {execution.contact.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                execution.status === 'COMPLETED'
                                  ? 'bg-green-100 text-green-800'
                                  : execution.status === 'RUNNING'
                                    ? 'bg-blue-100 text-blue-800'
                                    : execution.status === 'FAILED'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {execution.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {execution.currentStep?.name ?? '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {new Date(execution.startedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : activeTab === 'debug' ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Debug Information</CardTitle>
                <CardDescription>Raw workflow data for debugging</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Workflow Steps */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">Steps</h3>
                  <pre className="bg-neutral-50 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(
                      workflow.steps.map(s => ({
                        id: s.id,
                        type: s.type,
                        name: s.name,
                        position: s.position,
                        config: s.config,
                        templateId: s.templateId,
                      })),
                      null,
                      2,
                    )}
                  </pre>
                </div>

                {/* All Transitions */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">All Transitions</h3>
                  <pre className="bg-neutral-50 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(
                      workflow.steps.flatMap(step =>
                        step.outgoingTransitions.map(t => ({
                          id: t.id,
                          fromStepId: t.fromStepId,
                          fromStepName: step.name,
                          toStepId: t.toStepId,
                          toStepName: workflow.steps.find(s => s.id === t.toStepId)?.name,
                          condition: t.condition,
                          priority: t.priority,
                        })),
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </div>

                {/* Transition Analysis */}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 mb-3">Transition Analysis</h3>
                  <div className="space-y-3">
                    {workflow.steps.map(step => {
                      if (step.outgoingTransitions.length === 0) return null;
                      return (
                        <div key={step.id} className="border border-neutral-200 rounded-lg p-3">
                          <div className="font-medium text-sm text-neutral-900 mb-2">
                            {step.name} ({step.type})
                          </div>
                          <div className="space-y-1 text-xs">
                            {step.outgoingTransitions.map(t => {
                              const toStep = workflow.steps.find(s => s.id === t.toStepId);
                              const branch = t.condition?.branch;
                              return (
                                <div
                                  key={t.id}
                                  className={`flex items-start gap-2 ${
                                    branch === 'yes'
                                      ? 'text-green-700 bg-green-50'
                                      : branch === 'no'
                                        ? 'text-red-700 bg-red-50'
                                        : 'text-neutral-700 bg-neutral-50'
                                  } p-2 rounded`}
                                >
                                  <span className="font-mono flex-shrink-0">
                                    {branch === 'yes' ? '✓ YES' : branch === 'no' ? '✗ NO' : '→'}
                                  </span>
                                  <div className="flex-1">
                                    <div>→ {toStep?.name || 'Unknown'}</div>
                                    <div className="text-neutral-500 mt-1">
                                      Priority: {t.priority} | ID: {t.id}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Dialogs */}
      {workflow && (
        <>
          <SettingsDialog
            workflow={workflow}
            open={showSettingsDialog}
            onOpenChange={setShowSettingsDialog}
            onSave={handleUpdateSettings}
          />
          <TestWorkflowDialog open={showTestDialog} onOpenChange={setShowTestDialog} workflowId={id as string} />
          {editingStep && (
            <EditStepDialog
              step={editingStep}
              workflowId={id as string}
              open={!!editingStep}
              onOpenChange={open => !open && setEditingStep(null)}
              onSuccess={() => mutate()}
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
}

// Settings Dialog Component
interface SettingsDialogProps {
  workflow: Workflow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {name: string; description?: string; allowReentry?: boolean}) => Promise<void>;
}

function SettingsDialog({workflow, open, onOpenChange, onSave}: SettingsDialogProps) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  const [allowReentry, setAllowReentry] = useState(workflow.allowReentry ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSave({name, description: description || undefined, allowReentry});
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workflow Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
              rows={3}
            />
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
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Test Workflow Dialog Component
interface TestWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}

function TestWorkflowDialog({open, onOpenChange, workflowId}: TestWorkflowDialogProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // First, find or create the contact
      const contacts = await network.fetch<{contacts: any[]}>('GET', `/contacts?search=${email}`);
      let contactId = contacts.contacts.find(c => c.email === email)?.id;

      if (!contactId) {
        const newContact = await network.fetch<{id: string}>('POST', '/contacts', {
          email,
          subscribed: true,
        });
        contactId = newContact.id;
      }

      // Start workflow execution
      await network.fetch('POST', `/workflows/${workflowId}/executions`, {
        contactId,
      });

      toast.success('Workflow test started successfully');
      setEmail('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start workflow test');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Workflow</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Test Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="test@example.com"
            />
            <p className="text-xs text-neutral-500 mt-1">
              The workflow will be executed for this email address. If the contact doesn't exist, it will be created.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Starting...' : 'Start Test'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Add Step Dialog Component
interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  onSuccess: () => void;
}

function AddStepDialog({open, onOpenChange, workflowId, onSuccess}: AddStepDialogProps) {
  const [type, setType] = useState<WorkflowStep['type']>('SEND_EMAIL');
  const [name, setName] = useState('');

  // SEND_EMAIL fields
  const [templateId, setTemplateId] = useState('');

  // DELAY fields
  const [delayAmount, setDelayAmount] = useState('24');
  const [delayUnit, setDelayUnit] = useState<'hours' | 'days' | 'minutes'>('hours');

  // CONDITION fields
  const [conditionField, setConditionField] = useState('');
  const [conditionOperator, setConditionOperator] = useState('equals');
  const [conditionValue, setConditionValue] = useState('');
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // WAIT_FOR_EVENT fields
  const [eventName, setEventName] = useState('');
  const [eventTimeout, setEventTimeout] = useState('86400');

  // WEBHOOK fields
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMethod, setWebhookMethod] = useState('POST');
  const [webhookHeaders, setWebhookHeaders] = useState('');

  // UPDATE_CONTACT fields
  const [contactUpdates, setContactUpdates] = useState('');

  // EXIT fields
  const [exitReason, setExitReason] = useState('completed');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {data: templatesData} = useSWR<{templates: Template[]}>('/templates?pageSize=100');

  // Fetch available contact fields when dialog opens and type is CONDITION
  useEffect(() => {
    const fetchAvailableFields = async () => {
      if (type === 'CONDITION' && open) {
        setLoadingFields(true);
        try {
          const response = await network.fetch<{fields: string[]}>('GET', '/contacts/fields');
          setAvailableFields(response.fields);

          // Set default field if available
          if (response.fields.length > 0 && !conditionField) {
            setConditionField(response.fields[0]);
          }
        } catch (error) {
          console.error('Failed to fetch available fields:', error);
          setAvailableFields([]);
        } finally {
          setLoadingFields(false);
        }
      }
    };

    void fetchAvailableFields();
  }, [type, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Build step config based on type
      let config: any = {};

      if (type === 'SEND_EMAIL') {
        if (!templateId) {
          toast.error('Please select a template');
          setIsSubmitting(false);
          return;
        }
        config = {templateId};
      } else if (type === 'DELAY') {
        config = {amount: parseInt(delayAmount), unit: delayUnit};
      } else if (type === 'CONDITION') {
        // Parse the value based on type
        let parsedValue: any = conditionValue;
        if (conditionValue === 'true') parsedValue = true;
        else if (conditionValue === 'false') parsedValue = false;
        else if (!isNaN(Number(conditionValue))) parsedValue = Number(conditionValue);

        config = {
          field: conditionField,
          operator: conditionOperator,
          value: parsedValue,
        };
      } else if (type === 'EXIT') {
        config = {reason: exitReason};
      } else if (type === 'WEBHOOK') {
        if (!webhookUrl) {
          toast.error('Webhook URL is required');
          setIsSubmitting(false);
          return;
        }

        let headers = {};
        if (webhookHeaders.trim()) {
          try {
            headers = JSON.parse(webhookHeaders);
          } catch {
            toast.error('Invalid JSON in webhook headers');
            setIsSubmitting(false);
            return;
          }
        }

        config = {
          url: webhookUrl,
          method: webhookMethod,
          headers,
        };
      } else if (type === 'UPDATE_CONTACT') {
        if (!contactUpdates.trim()) {
          toast.error('Contact updates are required');
          setIsSubmitting(false);
          return;
        }

        try {
          const updates = JSON.parse(contactUpdates);
          config = {updates};
        } catch {
          toast.error('Invalid JSON in contact updates');
          setIsSubmitting(false);
          return;
        }
      } else if (type === 'WAIT_FOR_EVENT') {
        if (!eventName) {
          toast.error('Event name is required');
          setIsSubmitting(false);
          return;
        }
        config = {
          eventName,
          timeout: parseInt(eventTimeout),
        };
      }

      await network.fetch('POST', `/workflows/${workflowId}/steps`, {
        type,
        name,
        position: {x: 100, y: 100},
        config,
        templateId: type === 'SEND_EMAIL' ? templateId : undefined,
        autoConnect: false, // Disable auto-connect to prevent unwanted transitions
      });

      toast.success('Step added successfully');

      // Reset all fields
      setName('');
      setType('SEND_EMAIL');
      setTemplateId('');
      setDelayAmount('24');
      setDelayUnit('hours');
      setConditionField('');
      setConditionOperator('equals');
      setConditionValue('');
      setAvailableFields([]);
      setEventName('');
      setEventTimeout('86400');
      setWebhookUrl('');
      setWebhookMethod('POST');
      setWebhookHeaders('');
      setContactUpdates('');
      setExitReason('completed');

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add step');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Workflow Step</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="type">Step Type *</Label>
            <Select value={type} onValueChange={value => setType(value as any)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEND_EMAIL">Send Email</SelectItem>
                <SelectItem value="DELAY">Delay - Wait for time</SelectItem>
                <SelectItem value="WAIT_FOR_EVENT">Wait for Event</SelectItem>
                <SelectItem value="CONDITION">Condition - If/else branching</SelectItem>
                <SelectItem value="WEBHOOK">Webhook - Call external API</SelectItem>
                <SelectItem value="UPDATE_CONTACT">Update Contact</SelectItem>
                <SelectItem value="EXIT">Exit - End workflow</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500 mt-1">
              Note: The trigger step is automatically created with every workflow
            </p>
          </div>

          <div>
            <Label htmlFor="name">Step Name *</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g., Send Welcome Email"
            />
          </div>

          {/* SEND_EMAIL Configuration */}
          {type === 'SEND_EMAIL' && (
            <div>
              <Label htmlFor="template">Email Template *</Label>
              <Select value={templateId} onValueChange={setTemplateId} required>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templatesData?.templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DELAY Configuration */}
          {type === 'DELAY' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="delayAmount">Amount *</Label>
                <Input
                  id="delayAmount"
                  type="number"
                  value={delayAmount}
                  onChange={e => setDelayAmount(e.target.value)}
                  required
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="delayUnit">Unit *</Label>
                <Select value={delayUnit} onValueChange={value => setDelayUnit(value as any)}>
                  <SelectTrigger id="delayUnit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* CONDITION Configuration */}
          {type === 'CONDITION' && (
            <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
              <p className="text-sm text-neutral-600">Configure the condition to evaluate</p>

              <div>
                <Label htmlFor="conditionField">Field to Check *</Label>
                {loadingFields ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-500">
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    Loading fields...
                  </div>
                ) : availableFields.length > 0 ? (
                  <>
                    <Select value={conditionField} onValueChange={setConditionField} required>
                      <SelectTrigger id="conditionField">
                        <SelectValue placeholder="Select a field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map(field => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-neutral-500 mt-1">
                      Select from {availableFields.length} field{availableFields.length !== 1 ? 's' : ''} in your
                      contacts
                    </p>
                  </>
                ) : (
                  <>
                    <Input
                      id="conditionField"
                      type="text"
                      value={conditionField}
                      onChange={e => setConditionField(e.target.value)}
                      required
                      placeholder="e.g., subscribed or data.plan"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      No fields found in contacts. Enter a field manually.
                    </p>
                  </>
                )}
              </div>

              <div>
                <Label htmlFor="conditionOperator">Operator *</Label>
                <Select value={conditionOperator} onValueChange={setConditionOperator}>
                  <SelectTrigger id="conditionOperator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="notEquals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="notContains">Not Contains</SelectItem>
                    <SelectItem value="greaterThan">Greater Than</SelectItem>
                    <SelectItem value="lessThan">Less Than</SelectItem>
                    <SelectItem value="greaterThanOrEqual">Greater Than or Equal</SelectItem>
                    <SelectItem value="lessThanOrEqual">Less Than or Equal</SelectItem>
                    <SelectItem value="exists">Exists</SelectItem>
                    <SelectItem value="notExists">Not Exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="conditionValue">Value *</Label>
                <Input
                  id="conditionValue"
                  type="text"
                  value={conditionValue}
                  onChange={e => setConditionValue(e.target.value)}
                  required
                  placeholder="e.g., true, false, premium, 100"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Enter: true/false for booleans, numbers for comparisons, or text for strings
                </p>
              </div>
            </div>
          )}

          {/* WAIT_FOR_EVENT Configuration */}
          {type === 'WAIT_FOR_EVENT' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="eventName">Event Name *</Label>
                <Input
                  id="eventName"
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  required
                  placeholder="e.g., email.clicked, user.upgraded"
                />
                <p className="text-xs text-neutral-500 mt-1">The event name to wait for</p>
              </div>

              <div>
                <Label htmlFor="eventTimeout">Timeout (seconds)</Label>
                <Input
                  id="eventTimeout"
                  type="number"
                  value={eventTimeout}
                  onChange={e => setEventTimeout(e.target.value)}
                  placeholder="86400"
                  min="0"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  How long to wait before continuing (0 = wait forever). Default: 86400 (24 hours)
                </p>
              </div>
            </div>
          )}

          {/* WEBHOOK Configuration */}
          {type === 'WEBHOOK' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="webhookUrl">Webhook URL *</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  required
                  placeholder="https://api.example.com/webhook"
                />
              </div>

              <div>
                <Label htmlFor="webhookMethod">HTTP Method *</Label>
                <Select value={webhookMethod} onValueChange={setWebhookMethod}>
                  <SelectTrigger id="webhookMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="webhookHeaders">Headers (JSON, optional)</Label>
                <textarea
                  id="webhookHeaders"
                  value={webhookHeaders}
                  onChange={e => setWebhookHeaders(e.target.value)}
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
                  rows={3}
                />
                <p className="text-xs text-neutral-500 mt-1">Optional custom headers as JSON</p>
              </div>
            </div>
          )}

          {/* UPDATE_CONTACT Configuration */}
          {type === 'UPDATE_CONTACT' && (
            <div>
              <Label htmlFor="contactUpdates">Contact Data Updates (JSON) *</Label>
              <textarea
                id="contactUpdates"
                value={contactUpdates}
                onChange={e => setContactUpdates(e.target.value)}
                required
                placeholder='{"plan": "premium", "lastEngaged": "2025-01-19"}'
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
                rows={4}
              />
              <p className="text-xs text-neutral-500 mt-1">JSON object with fields to update in contact.data</p>
            </div>
          )}

          {/* EXIT Configuration */}
          {type === 'EXIT' && (
            <div>
              <Label htmlFor="exitReason">Exit Reason</Label>
              <Input
                id="exitReason"
                type="text"
                value={exitReason}
                onChange={e => setExitReason(e.target.value)}
                placeholder="e.g., unsubscribed, completed, not_eligible"
              />
              <p className="text-xs text-neutral-500 mt-1">Optional reason for exiting (for tracking/analytics)</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Step'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Step Dialog Component
interface EditStepDialogProps {
  step: WorkflowStep & {template?: {id: string; name: string} | null};
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function EditStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = step.config as any;

  const [name, setName] = useState(step.name);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SEND_EMAIL fields
  const [templateId, setTemplateId] = useState(step.template?.id || '');

  // DELAY fields
  const [delayAmount, setDelayAmount] = useState(String(config?.amount || '24'));
  const [delayUnit, setDelayUnit] = useState<'hours' | 'days' | 'minutes'>(config?.unit || 'hours');

  // CONDITION fields
  const [conditionField, setConditionField] = useState(config?.field || '');
  const [conditionOperator, setConditionOperator] = useState(config?.operator || 'equals');
  const [conditionValue, setConditionValue] = useState(String(config?.value ?? ''));
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // WAIT_FOR_EVENT fields
  const [eventName, setEventName] = useState(config?.eventName || '');
  const [eventTimeout, setEventTimeout] = useState(String(config?.timeout || '86400'));

  // WEBHOOK fields
  const [webhookUrl, setWebhookUrl] = useState(config?.url || '');
  const [webhookMethod, setWebhookMethod] = useState(config?.method || 'POST');
  const [webhookHeaders, setWebhookHeaders] = useState(config?.headers ? JSON.stringify(config.headers, null, 2) : '');

  // UPDATE_CONTACT fields
  const [contactUpdates, setContactUpdates] = useState(
    config?.updates ? JSON.stringify(config.updates, null, 2) : '',
  );

  // EXIT fields
  const [exitReason, setExitReason] = useState(config?.reason || 'completed');

  const {data: templatesData} = useSWR<{templates: Template[]}>('/templates?pageSize=100');

  // Fetch available contact fields when dialog opens and type is CONDITION
  useEffect(() => {
    const fetchAvailableFields = async () => {
      if (step.type === 'CONDITION' && open) {
        setLoadingFields(true);
        try {
          const response = await network.fetch<{fields: string[]}>('GET', '/contacts/fields');
          setAvailableFields(response.fields);
        } catch (error) {
          console.error('Failed to fetch available fields:', error);
          setAvailableFields([]);
        } finally {
          setLoadingFields(false);
        }
      }
    };

    void fetchAvailableFields();
  }, [step.type, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Build step config based on type
      let newConfig: any = {};

      if (step.type === 'SEND_EMAIL') {
        if (!templateId) {
          toast.error('Please select a template');
          setIsSubmitting(false);
          return;
        }
        newConfig = {templateId};
      } else if (step.type === 'DELAY') {
        newConfig = {amount: parseInt(delayAmount), unit: delayUnit};
      } else if (step.type === 'CONDITION') {
        // Parse the value based on type
        let parsedValue: any = conditionValue;
        if (conditionValue === 'true') parsedValue = true;
        else if (conditionValue === 'false') parsedValue = false;
        else if (!isNaN(Number(conditionValue))) parsedValue = Number(conditionValue);

        newConfig = {
          field: conditionField,
          operator: conditionOperator,
          value: parsedValue,
        };
      } else if (step.type === 'EXIT') {
        newConfig = {reason: exitReason};
      } else if (step.type === 'WEBHOOK') {
        if (!webhookUrl) {
          toast.error('Webhook URL is required');
          setIsSubmitting(false);
          return;
        }

        let headers = {};
        if (webhookHeaders.trim()) {
          try {
            headers = JSON.parse(webhookHeaders);
          } catch {
            toast.error('Invalid JSON in webhook headers');
            setIsSubmitting(false);
            return;
          }
        }

        newConfig = {
          url: webhookUrl,
          method: webhookMethod,
          headers,
        };
      } else if (step.type === 'UPDATE_CONTACT') {
        if (!contactUpdates.trim()) {
          toast.error('Contact updates are required');
          setIsSubmitting(false);
          return;
        }

        try {
          const updates = JSON.parse(contactUpdates);
          newConfig = {updates};
        } catch {
          toast.error('Invalid JSON in contact updates');
          setIsSubmitting(false);
          return;
        }
      } else if (step.type === 'WAIT_FOR_EVENT') {
        if (!eventName) {
          toast.error('Event name is required');
          setIsSubmitting(false);
          return;
        }
        newConfig = {
          eventName,
          timeout: parseInt(eventTimeout),
        };
      }

      await network.fetch('PATCH', `/workflows/${workflowId}/steps/${step.id}`, {
        name,
        config: newConfig,
        templateId: step.type === 'SEND_EMAIL' ? templateId : undefined,
      });

      toast.success('Step updated successfully');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update step');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Step</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="editStepName">Step Name *</Label>
            <Input
              id="editStepName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g., Send Welcome Email"
            />
          </div>

          <div className="px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-200">
            <p className="text-sm text-neutral-600">
              Type: <strong className="text-neutral-900">{step.type}</strong>
            </p>
          </div>

          {/* SEND_EMAIL Configuration */}
          {step.type === 'SEND_EMAIL' && (
            <div>
              <Label htmlFor="editTemplate">Email Template *</Label>
              <Select value={templateId} onValueChange={setTemplateId} required>
                <SelectTrigger id="editTemplate">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templatesData?.templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* DELAY Configuration */}
          {step.type === 'DELAY' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editDelayAmount">Amount *</Label>
                <Input
                  id="editDelayAmount"
                  type="number"
                  value={delayAmount}
                  onChange={e => setDelayAmount(e.target.value)}
                  required
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="editDelayUnit">Unit *</Label>
                <Select value={delayUnit} onValueChange={value => setDelayUnit(value as any)}>
                  <SelectTrigger id="editDelayUnit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* CONDITION Configuration */}
          {step.type === 'CONDITION' && (
            <div className="space-y-4 p-4 bg-neutral-50 rounded-lg">
              <p className="text-sm text-neutral-600">Configure the condition to evaluate</p>

              <div>
                <Label htmlFor="editConditionField">Field to Check *</Label>
                {loadingFields ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-500">
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    Loading fields...
                  </div>
                ) : availableFields.length > 0 ? (
                  <>
                    <Select value={conditionField} onValueChange={setConditionField} required>
                      <SelectTrigger id="editConditionField">
                        <SelectValue placeholder="Select a field..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map(field => (
                          <SelectItem key={field} value={field}>
                            {field}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-neutral-500 mt-1">
                      Select from {availableFields.length} field{availableFields.length !== 1 ? 's' : ''} in your
                      contacts
                    </p>
                  </>
                ) : (
                  <>
                    <Input
                      id="editConditionField"
                      type="text"
                      value={conditionField}
                      onChange={e => setConditionField(e.target.value)}
                      required
                      placeholder="e.g., subscribed or data.plan"
                    />
                    <p className="text-xs text-neutral-500 mt-1">No fields found in contacts. Enter a field manually.</p>
                  </>
                )}
              </div>

              <div>
                <Label htmlFor="editConditionOperator">Operator *</Label>
                <Select value={conditionOperator} onValueChange={setConditionOperator}>
                  <SelectTrigger id="editConditionOperator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="notEquals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="notContains">Not Contains</SelectItem>
                    <SelectItem value="greaterThan">Greater Than</SelectItem>
                    <SelectItem value="lessThan">Less Than</SelectItem>
                    <SelectItem value="greaterThanOrEqual">Greater Than or Equal</SelectItem>
                    <SelectItem value="lessThanOrEqual">Less Than or Equal</SelectItem>
                    <SelectItem value="exists">Exists</SelectItem>
                    <SelectItem value="notExists">Not Exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="editConditionValue">Value *</Label>
                <Input
                  id="editConditionValue"
                  type="text"
                  value={conditionValue}
                  onChange={e => setConditionValue(e.target.value)}
                  required
                  placeholder="e.g., true, false, premium, 100"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Enter: true/false for booleans, numbers for comparisons, or text for strings
                </p>
              </div>
            </div>
          )}

          {/* WAIT_FOR_EVENT Configuration */}
          {step.type === 'WAIT_FOR_EVENT' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="editEventName">Event Name *</Label>
                <Input
                  id="editEventName"
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  required
                  placeholder="e.g., email.clicked, user.upgraded"
                />
                <p className="text-xs text-neutral-500 mt-1">The event name to wait for</p>
              </div>

              <div>
                <Label htmlFor="editEventTimeout">Timeout (seconds)</Label>
                <Input
                  id="editEventTimeout"
                  type="number"
                  value={eventTimeout}
                  onChange={e => setEventTimeout(e.target.value)}
                  placeholder="86400"
                  min="0"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  How long to wait before continuing (0 = wait forever). Default: 86400 (24 hours)
                </p>
              </div>
            </div>
          )}

          {/* WEBHOOK Configuration */}
          {step.type === 'WEBHOOK' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="editWebhookUrl">Webhook URL *</Label>
                <Input
                  id="editWebhookUrl"
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  required
                  placeholder="https://api.example.com/webhook"
                />
              </div>

              <div>
                <Label htmlFor="editWebhookMethod">HTTP Method *</Label>
                <Select value={webhookMethod} onValueChange={setWebhookMethod}>
                  <SelectTrigger id="editWebhookMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="editWebhookHeaders">Headers (JSON, optional)</Label>
                <textarea
                  id="editWebhookHeaders"
                  value={webhookHeaders}
                  onChange={e => setWebhookHeaders(e.target.value)}
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
                  rows={3}
                />
                <p className="text-xs text-neutral-500 mt-1">Optional custom headers as JSON</p>
              </div>
            </div>
          )}

          {/* UPDATE_CONTACT Configuration */}
          {step.type === 'UPDATE_CONTACT' && (
            <div>
              <Label htmlFor="editContactUpdates">Contact Data Updates (JSON) *</Label>
              <textarea
                id="editContactUpdates"
                value={contactUpdates}
                onChange={e => setContactUpdates(e.target.value)}
                required
                placeholder='{"plan": "premium", "lastEngaged": "2025-01-19"}'
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
                rows={4}
              />
              <p className="text-xs text-neutral-500 mt-1">JSON object with fields to update in contact.data</p>
            </div>
          )}

          {/* EXIT Configuration */}
          {step.type === 'EXIT' && (
            <div>
              <Label htmlFor="editExitReason">Exit Reason</Label>
              <Input
                id="editExitReason"
                type="text"
                value={exitReason}
                onChange={e => setExitReason(e.target.value)}
                placeholder="e.g., unsubscribed, completed, not_eligible"
              />
              <p className="text-xs text-neutral-500 mt-1">Optional reason for exiting (for tracking/analytics)</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

