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

export default function Unsubscribe() {
  const router = useRouter();
  const {id} = router.query;

  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [success, setSuccess] = useState(false);

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

  const handleUnsubscribe = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      setUnsubscribing(true);
      const data = await network.fetch<ContactInfo>('POST', `/contacts/public/${id}/unsubscribe`);
      setContact(data);
      setSuccess(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    } finally {
      setUnsubscribing(false);
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

  if (success || (contact && !contact.subscribed)) {
    return (
      <div className={'h-screen flex items-center justify-center bg-neutral-50'}>
        <div className={'flex flex-col gap-6 max-w-2xl w-full px-4'}>
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <motion.div
                  initial={{scale: 0}}
                  animate={{scale: 1}}
                  transition={{type: 'spring', stiffness: 200, damping: 15}}
                  className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center"
                >
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <h1 className="text-2xl font-bold text-neutral-900">You&apos;re unsubscribed</h1>
                <p className="text-neutral-500">
                  {contact?.email} has been unsubscribed. You won&apos;t receive any more emails from us.
                </p>
                <p className="text-sm text-neutral-400 mt-2">
                  Changed your mind?{' '}
                  <button
                    onClick={() => router.push(`/subscribe/${id as string}`)}
                    className="underline hover:text-neutral-600"
                  >
                    Subscribe again
                  </button>
                </p>
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
                <h1 className="text-2xl font-bold text-neutral-900">Unsubscribe</h1>
                <p className="text-neutral-500">
                  We&apos;re sorry to see you go. Are you sure you want to unsubscribe <strong>{contact?.email}</strong>{' '}
                  from receiving emails?
                </p>
              </div>

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

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => void handleUnsubscribe()}
                  variant="destructive"
                  className="w-full"
                  disabled={unsubscribing}
                >
                  {unsubscribing ? (
                    <div className="flex items-center gap-2">
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
                      <span>Unsubscribing...</span>
                    </div>
                  ) : (
                    'Unsubscribe'
                  )}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => router.push(`/manage/${id as string}`)}>
                  Manage preferences instead
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
