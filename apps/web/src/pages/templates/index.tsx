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
import type {Template} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailDomainInput} from '../../components/EmailDomainInput';
import {network} from '../../lib/network';
import {Edit, FileText, Plus, Search, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

interface PaginatedTemplates {
  templates: Template[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'TRANSACTIONAL' | 'MARKETING'>('ALL');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const {data, mutate, isLoading} = useSWR<PaginatedTemplates>(
    `/templates?page=${page}&pageSize=20${search ? `&search=${search}` : ''}${typeFilter !== 'ALL' ? `&type=${typeFilter}` : ''}`,
    {revalidateOnFocus: false},
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/templates/${templateId}`);
      toast.success('Template deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete template');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Email Templates</h1>
            <p className="text-neutral-500 mt-2">
              Create and manage reusable email templates for your campaigns and workflows.{' '}
              {data?.total ? `${data.total} total templates` : ''}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                  <Input
                    type="text"
                    placeholder="Search templates..."
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
              </div>

              {/* Type Filter */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === 'ALL'
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  All Templates
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('MARKETING')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === 'MARKETING'
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Marketing
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('TRANSACTIONAL')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === 'TRANSACTIONAL'
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Transactional
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Templates Grid */}
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
                    <p className="mt-2 text-sm text-neutral-500">Loading templates...</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : data?.templates.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-neutral-900 mb-2">No templates found</h3>
                  <p className="text-neutral-500 mb-6">
                    {search ? 'Try adjusting your search terms' : 'Get started by creating your first template'}
                  </p>
                  {!search && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4" />
                      Create Template
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {data?.templates.map(template => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <CardTitle>{template.name}</CardTitle>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              template.type === 'MARKETING'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {template.type}
                          </span>
                        </div>
                        {template.description && (
                          <CardDescription className="mt-2">{template.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Link href={`/templates/${template.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(template.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">Subject</p>
                        <p className="text-sm font-medium text-neutral-900">{template.subject}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-1">From</p>
                        <p className="text-sm text-neutral-700">{template.from}</p>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-neutral-500 pt-2 border-t border-neutral-100">
                        <div>Created {new Date(template.createdAt).toLocaleDateString()}</div>
                        {template.replyTo && (
                          <div>
                            Reply to: <span className="text-neutral-700">{template.replyTo}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-neutral-500">
                    Showing {(page - 1) * data.pageSize + 1} to {Math.min(page * data.pageSize, data.total)} of{' '}
                    {data.total} templates
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

      {/* Create Template Dialog */}
      <CreateTemplateDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />
    </DashboardLayout>
  );
}

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateTemplateDialog({open, onOpenChange, onSuccess}: CreateTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<'MARKETING' | 'TRANSACTIONAL'>('MARKETING');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const template = await network.fetch<Template>('POST', '/templates', {
        name,
        description: description || undefined,
        subject,
        body,
        from,
        replyTo: replyTo || undefined,
        type,
      });

      toast.success('Template created successfully');
      setName('');
      setDescription('');
      setSubject('');
      setFrom('');
      setReplyTo('');
      setBody('');
      setType('MARKETING');
      onOpenChange(false);
      onSuccess();

      // Redirect to the template editor
      window.location.href = `/templates/${template.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Template</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Welcome Email"
              />
            </div>

            <div>
              <Label htmlFor="type">Type *</Label>
              <Select value={type} onValueChange={value => setType(value as any)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Sent to new subscribers"
            />
          </div>

          <div>
            <Label htmlFor="subject">Subject Line *</Label>
            <Input
              id="subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              placeholder="Welcome to our platform!"
            />
          </div>

          <div>
            <EmailDomainInput
              id="from"
              label="From Email *"
              value={from}
              onChange={setFrom}
              required
              placeholder="hello"
            />
          </div>

          <div>
            <EmailDomainInput
              id="replyTo"
              label="Reply-To Email"
              value={replyTo}
              onChange={setReplyTo}
              placeholder="support"
            />
          </div>

          <div>
            <Label htmlFor="body">Email Body (HTML) *</Label>
            <textarea
              id="body"
              value={body}
              onChange={e => setBody(e.target.value)}
              required
              placeholder="<h1>Welcome!</h1><p>Thanks for subscribing to our newsletter.</p>"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono"
              rows={8}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Use {'{{variableName}}'} for dynamic content (e.g., {'{{firstName}}'})
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
