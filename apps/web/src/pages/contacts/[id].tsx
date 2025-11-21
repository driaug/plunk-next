import {Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label} from '@repo/ui';
import type {Contact} from '@repo/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {KeyValueEditor} from '../../components/KeyValueEditor';
import {network} from '../../lib/network';
import {ArrowLeft, Calendar, Copy, Database, ExternalLink, Mail, Save, Settings, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {ContactSchemas} from '@repo/shared';

export default function ContactDetailPage() {
  const router = useRouter();
  const {id} = router.query;
  const {data: contact, mutate, isLoading} = useSWR<Contact>(id ? `/contacts/${id}` : null);

  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(true);
  const [customData, setCustomData] = useState<Record<string, string | number | boolean> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when contact loads
  useEffect(() => {
    if (contact) {
      setEmail(contact.email);
      setSubscribed(contact.subscribed);
      setCustomData(contact.data as Record<string, string | number | boolean> | null);
    }
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await network.fetch<
        {
          success: boolean;
        },
        typeof ContactSchemas.create
      >('PATCH', `/contacts/${id}`, {email, subscribed, data: customData});
      toast.success('Contact updated successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/contacts/${id}`);
      toast.success('Contact deleted successfully');
      void router.push('/contacts');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete contact');
    }
  };

  const copyToClipboard = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} link copied to clipboard`);
    } catch (error) {
      toast.error('Failed to copy link');
    }
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
            <p className="mt-2 text-sm text-neutral-500">Loading contact...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!contact) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-neutral-900 mb-2">Contact not found</h3>
          <p className="text-neutral-500 mb-6">The contact you're looking for doesn't exist or has been deleted.</p>
          <Link href="/contacts">
            <Button>
              <ArrowLeft className="h-4 w-4" />
              Back to Contacts
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
            <Link href="/contacts">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">{contact.email}</h1>
              <p className="text-neutral-500 mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    contact.subscribed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {contact.subscribed ? 'Subscribed' : 'Unsubscribed'}
                </span>
              </p>
            </div>
          </div>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Delete Contact
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Edit Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>Update contact details and subscription status</CardDescription>
              </CardHeader>
              <CardContent>
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

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label htmlFor="subscribed" className="text-sm font-medium text-neutral-900 cursor-pointer">
                        Subscribed to emails
                      </Label>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {subscribed ? 'Contact will receive emails' : 'Contact will not receive emails'}
                      </p>
                    </div>
                    <button
                      type="button"
                      id="subscribed"
                      onClick={() => setSubscribed(!subscribed)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 ${
                        subscribed ? 'bg-neutral-900' : 'bg-neutral-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          subscribed ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    {contact && (
                      <KeyValueEditor
                        key={`${contact.id}-${JSON.stringify(contact.data)}`}
                        initialData={contact.data as Record<string, string | number | boolean> | null}
                        onChange={setCustomData}
                      />
                    )}
                  </div>

                  <Button type="submit" disabled={isSubmitting}>
                    <Save className="h-4 w-4" />
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Metadata Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">Email</p>
                    <p className="text-sm text-neutral-500 break-all">{contact.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">Created</p>
                    <p className="text-sm text-neutral-500">
                      {new Date(contact.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">Last Updated</p>
                    <p className="text-sm text-neutral-500">
                      {new Date(contact.updatedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-neutral-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">Contact ID</p>
                    <p className="text-xs text-neutral-500 font-mono break-all">{contact.id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>Email engagement statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">Emails Sent</span>
                  <span className="text-sm font-medium text-neutral-900">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">Emails Opened</span>
                  <span className="text-sm font-medium text-neutral-900">0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">Links Clicked</span>
                  <span className="text-sm font-medium text-neutral-900">0</span>
                </div>
              </CardContent>
            </Card>

            {/* Public Links Card */}
            <Card>
              <CardHeader>
                <CardTitle>Public Links</CardTitle>
                <CardDescription>Share these links with the contact</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-700">Subscribe Page</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 justify-start text-xs"
                      onClick={() => window.open(`${window.location.origin}/subscribe/${contact.id}`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(`${window.location.origin}/subscribe/${contact.id}`, 'Subscribe')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-700">Unsubscribe Page</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 justify-start text-xs"
                      onClick={() => window.open(`${window.location.origin}/unsubscribe/${contact.id}`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(`${window.location.origin}/unsubscribe/${contact.id}`, 'Unsubscribe')
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-700">Manage Preferences</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 justify-start text-xs"
                      onClick={() => window.open(`${window.location.origin}/manage/${contact.id}`, '_blank')}
                    >
                      <Settings className="h-3 w-3" />
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(`${window.location.origin}/manage/${contact.id}`, 'Manage')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-xs text-neutral-500">
                    These public links allow the contact to manage their subscription without logging in.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
