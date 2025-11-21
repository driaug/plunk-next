import {Button, Card, CardContent} from '@repo/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {useRouter} from 'next/router';
import React, {useEffect, useState} from 'react';

import {network} from '../../lib/network';

interface ContactInfo {
  id: string;
  email: string;
  subscribed: boolean;
}

export default function Manage() {
  const router = useRouter();
  const {id} = router.query;

  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    const fetchContact = async () => {
      try {
        setLoading(true);
        const data = await network.fetch<ContactInfo>('GET', `/contacts/public/${id}`);
        setContact(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contact information');
      } finally {
        setLoading(false);
      }
    };

    void fetchContact();
  }, [id]);

  const handleToggleSubscription = async () => {
    if (!id || typeof id !== 'string' || !contact) return;

    try {
      setUpdating(true);
      setSaveMessage(null);

      const endpoint = contact.subscribed ? `/contacts/public/${id}/unsubscribe` : `/contacts/public/${id}/subscribe`;

      const data = await network.fetch<ContactInfo>('POST', endpoint);
      setContact(data);
      setSaveMessage(data.subscribed ? 'Subscribed successfully!' : 'Unsubscribed successfully!');
      setError(null);

      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className={'h-screen flex items-center justify-center bg-neutral-50'}>
        <div className={'flex flex-col gap-6 max-w-2xl w-full px-4'}>
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4">
                <svg
                  className="h-8 w-8 animate-spin text-neutral-500"
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
                <p className="text-sm text-neutral-500">Loading...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error && !contact) {
    return (
      <div className={'h-screen flex items-center justify-center bg-neutral-50'}>
        <div className={'flex flex-col gap-6 max-w-2xl w-full px-4'}>
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-neutral-900">Error</h1>
                <p className="text-neutral-500">{error}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={'h-screen flex items-center justify-center bg-neutral-50'}>
      <div className={'flex flex-col gap-6 max-w-2xl w-full px-4'}>
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center gap-2">
                <h1 className="text-2xl font-bold text-neutral-900">Manage Preferences</h1>
                <p className="text-neutral-500">
                  Manage email preferences for <strong>{contact?.email}</strong>
                </p>
              </div>

              <div className="border rounded-lg p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-neutral-900">Email Subscription</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      {contact?.subscribed
                        ? 'You are currently subscribed to receive emails'
                        : 'You are currently unsubscribed from emails'}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleToggleSubscription()}
                    disabled={updating}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 ${
                      contact?.subscribed ? 'bg-neutral-900' : 'bg-neutral-200'
                    } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        contact?.subscribed ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {saveMessage && (
                  <motion.div
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    className="text-sm font-medium text-green-600 text-center bg-green-50 p-3 rounded-lg"
                  >
                    {saveMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{opacity: 0, y: -10}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    className="text-sm font-medium text-red-500 text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex gap-3">
                {contact?.subscribed ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/unsubscribe/${id as string}`)}
                  >
                    Unsubscribe completely
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/subscribe/${id as string}`)}
                  >
                    Subscribe to emails
                  </Button>
                )}
              </div>

              <div className="text-center text-xs text-neutral-400 mt-2">
                <p>
                  This page allows you to manage your email preferences. Your subscription status is updated in
                  real-time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
