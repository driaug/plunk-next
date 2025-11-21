import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type {Contact, Segment} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {
  ArrowLeft,
  Calendar,
  Database,
  Filter,
  MailCheck,
  MailX,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import type {SegmentFilter} from '@repo/types';

const FILTER_OPERATORS = [
  {value: 'equals', label: 'Equals'},
  {value: 'notEquals', label: 'Not equals'},
  {value: 'contains', label: 'Contains'},
  {value: 'notContains', label: 'Does not contain'},
  {value: 'greaterThan', label: 'Greater than'},
  {value: 'lessThan', label: 'Less than'},
  {value: 'greaterThanOrEqual', label: 'Greater than or equal to'},
  {value: 'lessThanOrEqual', label: 'Less than or equal to'},
  {value: 'exists', label: 'Exists'},
  {value: 'notExists', label: 'Does not exist'},
  {value: 'within', label: 'Within (time)'},
] as const;

const TIME_UNITS = [
  {value: 'minutes', label: 'Minutes'},
  {value: 'hours', label: 'Hours'},
  {value: 'days', label: 'Days'},
] as const;

const FIELD_PRESETS = [
  {value: 'email', label: 'Email', type: 'string'},
  {value: 'subscribed', label: 'Subscribed', type: 'boolean'},
  {value: 'createdAt', label: 'Created At', type: 'date'},
  {value: 'updatedAt', label: 'Updated At', type: 'date'},
  {value: 'data.firstName', label: 'First Name (custom)', type: 'string'},
  {value: 'data.lastName', label: 'Last Name (custom)', type: 'string'},
  {value: 'data.plan', label: 'Plan (custom)', type: 'string'},
] as const;

interface PaginatedContacts {
  contacts: Contact[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function SegmentDetailPage() {
  const router = useRouter();
  const {id} = router.query;

  const {data: segment, mutate, isLoading} = useSWR<Segment>(id ? `/segments/${id}` : null);
  const [contactsPage, setContactsPage] = useState(1);
  const {data: contactsData, isLoading: isLoadingContacts} = useSWR<PaginatedContacts>(
    id ? `/segments/${id}/contacts?page=${contactsPage}&pageSize=10` : null,
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trackMembership, setTrackMembership] = useState(false);
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComputing, setIsComputing] = useState(false);

  // Initialize form when segment loads
  useEffect(() => {
    if (segment) {
      setName(segment.name);
      setDescription(segment.description || '');
      setTrackMembership(segment.trackMembership);
      setFilters((segment.filters as SegmentFilter[]) || []);
    }
  }, [segment]);

  const addFilter = () => {
    setFilters([...filters, {field: 'email', operator: 'contains', value: ''}]);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<SegmentFilter>) => {
    setFilters(filters.map((filter, i) => (i === index ? {...filter, ...updates} : filter)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await network.fetch('PATCH', `/segments/${id}`, {
        name,
        description: description || undefined,
        filters,
        trackMembership,
      });
      toast.success('Segment updated successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update segment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComputeMembership = async () => {
    if (!trackMembership) {
      toast.error('Membership tracking must be enabled to compute membership');
      return;
    }

    setIsComputing(true);
    try {
      const result = await network.fetch<{added: number; removed: number; total: number}>(
        'POST',
        `/segments/${id}/compute`,
      );
      toast.success(`Membership updated: ${result.added} added, ${result.removed} removed, ${result.total} total`);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to compute membership');
    } finally {
      setIsComputing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this segment? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/segments/${id}`);
      toast.success('Segment deleted successfully');
      void router.push('/segments');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete segment');
    }
  };

  const needsValue = (operator: string) => {
    return !['exists', 'notExists'].includes(operator);
  };

  const needsUnit = (operator: string) => {
    return operator === 'within';
  };

  if (isLoading) {
    return (
      <DashboardLayout>
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
            <p className="mt-2 text-sm text-neutral-500">Loading segment...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!segment) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-neutral-900 mb-2">Segment not found</h3>
          <p className="text-neutral-500 mb-6">The segment you're looking for doesn't exist or has been deleted.</p>
          <Link href="/segments">
            <Button>
              <ArrowLeft className="h-4 w-4" />
              Back to Segments
            </Button>
          </Link>
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
            <Link href="/segments">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">{segment.name}</h1>
              <p className="text-neutral-500 mt-1">{segment.description}</p>
            </div>
          </div>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Delete Segment
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Edit Form */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Segment Details</CardTitle>
                  <CardDescription>Update segment name and description</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">Segment Name *</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      placeholder="e.g., Active Pro Users"
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="e.g., Users on pro plan who have been active in the last 30 days"
                      maxLength={500}
                    />
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                    <input
                      id="trackMembership"
                      type="checkbox"
                      checked={trackMembership}
                      onChange={e => setTrackMembership(e.target.checked)}
                      className="mt-1 h-4 w-4 text-neutral-900 focus:ring-neutral-900 border-neutral-300 rounded"
                    />
                    <div className="flex-1">
                      <Label htmlFor="trackMembership" className="font-medium cursor-pointer">
                        Track membership changes
                      </Label>
                      <p className="text-xs text-neutral-500 mt-1">
                        When enabled, segment entry and exit events will be tracked for use in workflows and analytics
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Filters */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Filters</CardTitle>
                      <CardDescription>Define conditions to match contacts</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                      <Plus className="h-4 w-4" />
                      Add Filter
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {filters.map((filter, index) => (
                    <div key={index} className="flex items-start gap-2 p-4 border border-neutral-200 rounded-lg">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Field */}
                        <div>
                          <Label className="text-xs">Field</Label>
                          <Select value={filter.field} onValueChange={value => updateFilter(index, {field: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_PRESETS.map(preset => (
                                <SelectItem key={preset.value} value={preset.value}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                              <SelectItem value="custom">Custom field...</SelectItem>
                            </SelectContent>
                          </Select>
                          {filter.field === 'custom' && (
                            <Input
                              type="text"
                              placeholder="e.g., data.customField"
                              className="mt-2"
                              onChange={e => updateFilter(index, {field: e.target.value})}
                            />
                          )}
                        </div>

                        {/* Operator */}
                        <div>
                          <Label className="text-xs">Operator</Label>
                          <Select
                            value={filter.operator}
                            onValueChange={value => updateFilter(index, {operator: value as SegmentFilter['operator']})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FILTER_OPERATORS.map(op => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Value */}
                        {needsValue(filter.operator) && (
                          <div>
                            <Label className="text-xs">Value</Label>
                            {filter.field === 'subscribed' ? (
                              <Select
                                value={filter.value?.toString()}
                                onValueChange={value => updateFilter(index, {value: value === 'true'})}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">True</SelectItem>
                                  <SelectItem value="false">False</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type="text"
                                value={filter.value ?? ''}
                                onChange={e => updateFilter(index, {value: e.target.value})}
                                placeholder="Enter value"
                              />
                            )}
                          </div>
                        )}

                        {/* Unit */}
                        {needsUnit(filter.operator) && (
                          <div>
                            <Label className="text-xs">Unit</Label>
                            <Select
                              value={filter.unit ?? 'days'}
                              onValueChange={value => updateFilter(index, {unit: value as SegmentFilter['unit']})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_UNITS.map(unit => (
                                  <SelectItem key={unit.value} value={unit.value}>
                                    {unit.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFilter(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-6"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex items-center justify-end">
                <Button type="submit" disabled={isSubmitting || filters.length === 0}>
                  <Save className="h-4 w-4" />
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>

            {/* Contacts */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Matching Contacts</CardTitle>
                    <CardDescription>Contacts that match this segment's filters</CardDescription>
                  </div>
                  {trackMembership && (
                    <Button variant="outline" size="sm" onClick={handleComputeMembership} disabled={isComputing}>
                      <RefreshCw className={`h-4 w-4 ${isComputing ? 'animate-spin' : ''}`} />
                      {isComputing ? 'Computing...' : 'Recompute'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingContacts ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-neutral-500">Loading contacts...</p>
                  </div>
                ) : contactsData?.contacts.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                    <p className="text-neutral-500">No contacts match this segment</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {contactsData?.contacts.map(contact => (
                        <div key={contact.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-2">
                            {contact.subscribed ? (
                              <MailCheck className="h-4 w-4 text-green-600" />
                            ) : (
                              <MailX className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm font-medium">{contact.email}</span>
                          </div>
                          <Link href={`/contacts/${contact.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {contactsData && contactsData.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-neutral-500">
                          Page {contactsPage} of {contactsData.totalPages} ({contactsData.total} total)
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setContactsPage(p => p - 1)}
                            disabled={contactsPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setContactsPage(p => p + 1)}
                            disabled={contactsPage === contactsData.totalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Metadata Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-neutral-500" />
                    <span className="text-sm text-neutral-600">Members</span>
                  </div>
                  <span className="text-2xl font-bold text-neutral-900">{segment.memberCount}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-neutral-500" />
                    <span className="text-sm text-neutral-600">Filters</span>
                  </div>
                  <span className="text-lg font-semibold text-neutral-900">
                    {Array.isArray(segment.filters) ? segment.filters.length : 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">Created</p>
                    <p className="text-sm text-neutral-500">{new Date(segment.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">Last Updated</p>
                    <p className="text-sm text-neutral-500">{new Date(segment.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">Segment ID</p>
                    <p className="text-xs text-neutral-500 font-mono break-all">{segment.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
