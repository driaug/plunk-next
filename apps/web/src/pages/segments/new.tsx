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
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {ArrowLeft, Filter, Plus, Save, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useState} from 'react';
import {toast} from 'sonner';
import type {SegmentFilter} from '@repo/types';
import type {Segment} from '@repo/db';
import {SegmentSchemas} from '@repo/shared';

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

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trackMembership, setTrackMembership] = useState(false);
  const [filters, setFilters] = useState<SegmentFilter[]>([{field: 'subscribed', operator: 'equals', value: true}]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const segment = await network.fetch<Segment, typeof SegmentSchemas.create>('POST', '/segments', {
        name,
        description: description || undefined,
        filters,
        trackMembership,
      });
      toast.success('Segment created successfully');
      void router.push('/segments');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create segment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const needsValue = (operator: string) => {
    return !['exists', 'notExists'].includes(operator);
  };

  const needsUnit = (operator: string) => {
    return operator === 'within';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/segments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Create Segment</h1>
            <p className="text-neutral-500 mt-1">Define filters to automatically group contacts</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Segment Details</CardTitle>
              <CardDescription>Give your segment a name and description</CardDescription>
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
                  <CardDescription>Define conditions to match contacts (all filters must match)</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="h-4 w-4" />
                  Add Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {filters.length === 0 ? (
                <div className="text-center py-8">
                  <Filter className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                  <p className="text-neutral-500 mb-4">No filters defined. Add at least one filter.</p>
                  <Button type="button" variant="outline" onClick={addFilter}>
                    <Plus className="h-4 w-4" />
                    Add First Filter
                  </Button>
                </div>
              ) : (
                filters.map((filter, index) => (
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

                      {/* Unit (for within operator) */}
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

                    {/* Remove button */}
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
                ))
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <Link href="/segments">
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={isSubmitting || filters.length === 0}>
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Creating...' : 'Create Segment'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
