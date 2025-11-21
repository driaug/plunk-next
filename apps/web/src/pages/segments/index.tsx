import {Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle} from '@repo/ui';
import type {Segment} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {AlertTriangle, Edit, Filter, Plus, Trash2, Users} from 'lucide-react';
import Link from 'next/link';
import {toast} from 'sonner';
import useSWR from 'swr';

export default function SegmentsPage() {
  // Limit to 50 segments to avoid loading thousands into the browser
  const {
    data: segments,
    mutate,
    isLoading,
  } = useSWR<Segment[]>('/segments', {
    revalidateOnFocus: false,
  });

  // Show warning if there are many segments
  const showLimitWarning = segments && segments.length >= 50;

  const handleDelete = async (segmentId: string) => {
    if (!confirm('Are you sure you want to delete this segment? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/segments/${segmentId}`);
      toast.success('Segment deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete segment');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Segments</h1>
            <p className="text-neutral-500 mt-2">
              Create dynamic audience groups based on contact attributes and behaviors
            </p>
          </div>
          <Link href="/segments/new">
            <Button>
              <Plus className="h-4 w-4" />
              Create Segment
            </Button>
          </Link>
        </div>

        {/* Warning if too many segments */}
        {showLimitWarning && (
          <Alert variant="default">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Showing first {segments?.length} segments. Consider archiving old segments to improve performance.
            </AlertDescription>
          </Alert>
        )}

        {/* Segments Grid */}
        {isLoading ? (
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
              <p className="mt-2 text-sm text-neutral-500">Loading segments...</p>
            </div>
          </div>
        ) : segments?.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Filter className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No segments yet</h3>
                <p className="text-neutral-500 mb-6">
                  Create your first segment to group contacts based on attributes and behaviors
                </p>
                <Link href="/segments/new">
                  <Button>
                    <Plus className="h-4 w-4" />
                    Create Segment
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {segments?.map(segment => (
              <Card key={segment.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{segment.name}</CardTitle>
                      {segment.description && <CardDescription className="mt-1">{segment.description}</CardDescription>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-neutral-500" />
                        <span className="text-sm text-neutral-600">Members</span>
                      </div>
                      <span className="text-lg font-semibold text-neutral-900">{segment.memberCount}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-neutral-500" />
                        <span className="text-sm text-neutral-600">Filters</span>
                      </div>
                      <span className="text-sm font-medium text-neutral-900">
                        {Array.isArray(segment.filters) ? segment.filters.length : 0}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200">
                      <Link href={`/segments/${segment.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(segment.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Metadata */}
                    <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-200">
                      Created {new Date(segment.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
