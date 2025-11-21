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
} from '@repo/ui';
import type {Contact} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {KeyValueEditor} from '../../components/KeyValueEditor';
import {network} from '../../lib/network';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileUp,
  Mail,
  MailCheck,
  MailX,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {ContactSchemas} from '@repo/shared';

interface PaginatedContacts {
  contacts: Contact[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}

export default function ContactsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [currentPage, setCurrentPage] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 50;

  const {data, mutate, isLoading} = useSWR<PaginatedContacts>(
    `/contacts?limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}${search ? `&search=${search}` : ''}`,
    {revalidateOnFocus: false},
  );

  // Update contacts when data changes
  useEffect(() => {
    if (data) {
      setContacts(data.contacts);
      if (!cursor) {
        setTotalCount(data.total || data.contacts.length);
      }
    }
  }, [data, cursor]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setCursor(undefined);
    setCursorHistory([undefined]);
    setCurrentPage(0);
    setContacts([]);
  };

  const handleNextPage = () => {
    if (data?.cursor) {
      const newPage = currentPage + 1;
      setCursor(data.cursor);
      setCurrentPage(newPage);

      // Store cursor in history if not already there
      if (cursorHistory.length <= newPage) {
        setCursorHistory(prev => [...prev, data.cursor]);
      }
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      const newPage = currentPage - 1;
      const previousCursor = cursorHistory[newPage];
      setCursor(previousCursor);
      setCurrentPage(newPage);
    }
  };

  const handleDelete = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/contacts/${contactId}`);
      toast.success('Contact deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete contact');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Contacts</h1>
            <p className="text-neutral-500 mt-2">
              Manage your email subscribers and their data.{' '}
              {totalCount > 0 ? `${totalCount.toLocaleString()} total contacts` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* Search & Filters */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <Input
                  type="text"
                  placeholder="Search by email..."
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
                    setCursor(undefined);
                    setCursorHistory([undefined]);
                    setCurrentPage(0);
                    setContacts([]);
                  }}
                >
                  Clear
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Contacts</CardTitle>
            <CardDescription>
              View and manage your contact list.
              {totalCount > 0 && ` ${totalCount.toLocaleString()} total contacts`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && contacts.length === 0 ? (
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
                  <p className="mt-2 text-sm text-neutral-500">Loading contacts...</p>
                </div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No contacts found</h3>
                <p className="text-neutral-500 mb-6">
                  {search ? 'Try adjusting your search terms' : 'Get started by creating your first contact'}
                </p>
                {!search && (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4" />
                    Add Contact
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {contacts.map(contact => (
                        <tr key={contact.id} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {contact.subscribed ? (
                                <MailCheck className="h-4 w-4 text-green-600" />
                              ) : (
                                <MailX className="h-4 w-4 text-red-600" />
                              )}
                              <span className="text-sm font-medium text-neutral-900">{contact.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                contact.subscribed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {contact.subscribed ? 'Subscribed' : 'Unsubscribed'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {new Date(contact.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/contacts/${contact.id}`}>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(contact.id)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {(currentPage > 0 || data?.hasMore) && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-neutral-200">
                    <div className="text-sm text-neutral-600">
                      Showing <span className="font-medium text-neutral-900">{currentPage * pageSize + 1}</span> to{' '}
                      <span className="font-medium text-neutral-900">{currentPage * pageSize + contacts.length}</span>
                      {totalCount > 0 && (
                        <>
                          {' '}
                          of <span className="font-medium text-neutral-900">{totalCount.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handlePreviousPage} disabled={currentPage === 0 || isLoading}>
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button variant="outline" onClick={handleNextPage} disabled={!data?.hasMore || isLoading}>
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Contact Dialog */}
      <CreateContactDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />

      {/* Import Contacts Dialog */}
      <ImportContactsDialog open={showImportDialog} onOpenChange={setShowImportDialog} onSuccess={() => mutate()} />
    </DashboardLayout>
  );
}

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateContactDialog({open, onOpenChange, onSuccess}: CreateContactDialogProps) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(true);
  const [customData, setCustomData] = useState<Record<string, string | number | boolean> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await network.fetch<
        {
          _meta?: {isNew: boolean; isUpdate: boolean};
          email: string;
        },
        typeof ContactSchemas.create
      >('POST', '/contacts', {email, subscribed, data: customData});

      // Show appropriate message based on whether contact was new or updated
      if (response._meta?.isUpdate) {
        toast.success(`Contact ${response.email} already existed and was updated with new data`);
      } else {
        toast.success('Contact created successfully');
      }

      setEmail('');
      setSubscribed(true);
      setCustomData(null);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="contact@example.com"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="subscribed"
              checked={subscribed}
              onChange={e => setSubscribed(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <Label htmlFor="subscribed" className="cursor-pointer">
              Subscribed
            </Label>
          </div>

          <div>
            <KeyValueEditor key={open ? 'create' : 'closed'} initialData={customData} onChange={setCustomData} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResult {
  totalRows: number;
  successCount: number;
  createdCount: number;
  updatedCount: number;
  failureCount: number;
  errors: Array<{row: number; email: string; error: string}>;
}

function ImportContactsDialog({open, onOpenChange, onSuccess}: ImportContactsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'failed'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up polling on unmount or dialog close
  useEffect(() => {
    if (!open) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Reset state when dialog closes
      setTimeout(() => {
        setFile(null);
        setJobId(null);
        setProgress(0);
        setStatus('idle');
        setResult(null);
      }, 300);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }

      // Validate file size (5MB max)
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }

      setFile(selectedFile);
      setStatus('idle');
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await network.fetch<{
        id: string;
        state: string;
        progress: number;
        result: ImportResult | null;
      }>('GET', `/contacts/import/${jobId}`);

      setProgress(response.progress || 0);

      if (response.state === 'completed') {
        setStatus('completed');
        setResult(response.result);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Show success message
        if (response.result) {
          const {createdCount, updatedCount, failureCount} = response.result;
          const parts = [];
          if (createdCount > 0) parts.push(`${createdCount} created`);
          if (updatedCount > 0) parts.push(`${updatedCount} updated`);
          if (failureCount > 0) parts.push(`${failureCount} failed`);

          toast.success(`Import completed: ${parts.join(', ')}`);
        }

        onSuccess();
      } else if (response.state === 'failed') {
        setStatus('failed');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        toast.error('Import failed. Please try again.');
      } else if (response.state === 'active') {
        setStatus('processing');
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setStatus('failed');
      toast.error('Failed to check import status');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await network.upload<{jobId: string; message: string}>('POST', '/contacts/import', formData);

      setJobId(data.jobId);
      setStatus('processing');

      // Start polling for job status
      pollIntervalRef.current = setInterval(() => {
        void pollJobStatus(data.jobId);
      }, 1000); // Poll every second
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
      setStatus('failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (status === 'processing') {
      if (!confirm('Import is still in progress. Are you sure you want to close?')) {
        return;
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">CSV Format Requirements</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>First row must contain column headers</li>
              <li>
                Required column: <code className="bg-blue-100 px-1 rounded">email</code>
              </li>
              <li>Optional: Add any custom fields (e.g., firstName, lastName, plan)</li>
              <li>Maximum 10,000 rows per file</li>
              <li>Maximum file size: 5MB</li>
            </ul>
          </div>

          {/* File Upload */}
          {status === 'idle' || status === 'failed' ? (
            <div>
              <Label htmlFor="csv-file">Select CSV File</Label>
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  {file ? file.name : 'Choose CSV File'}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Progress */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">
                  {status === 'uploading' ? 'Uploading file...' : 'Processing contacts...'}
                </span>
                <span className="text-neutral-900 font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{width: `${progress}%`}}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {status === 'completed' && result && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-neutral-900">{result.totalRows}</div>
                  <div className="text-sm text-neutral-600">Total</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div className="text-2xl font-bold text-green-900">{result.createdCount}</div>
                  </div>
                  <div className="text-sm text-green-700">Created</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                    <div className="text-2xl font-bold text-blue-900">{result.updatedCount}</div>
                  </div>
                  <div className="text-sm text-blue-700">Updated</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <div className="text-2xl font-bold text-red-900">{result.failureCount}</div>
                  </div>
                  <div className="text-sm text-red-700">Failed</div>
                </div>
              </div>

              {/* Error Details */}
              {result.errors && result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <h4 className="font-medium text-red-900 mb-2">Import Errors</h4>
                  <div className="space-y-1 text-sm text-red-800">
                    {result.errors.slice(0, 10).map((error, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="font-mono text-xs">Row {error.row}:</span>
                        <span>
                          {error.email || 'N/A'} - {error.error}
                        </span>
                      </div>
                    ))}
                    {result.errors.length > 10 && (
                      <div className="text-red-700 font-medium mt-2">
                        ...and {result.errors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-900">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Import failed</span>
              </div>
              <p className="text-sm text-red-800 mt-1">Please check your CSV file and try again.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {status === 'idle' || status === 'failed' ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading ? 'Uploading...' : 'Import Contacts'}
              </Button>
            </>
          ) : status === 'completed' ? (
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
