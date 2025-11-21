import {zodResolver} from '@hookform/resolvers/zod';
import {AuthenticationSchemas} from '@repo/shared';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import {AnimatePresence, motion} from 'framer-motion';
import Link from 'next/link';
import {useRouter} from 'next/router';
import React, {useState} from 'react';
import {useForm} from 'react-hook-form';
import type {z} from 'zod';

import {useProjects} from '../../lib/hooks/useProject';
import {useUser} from '../../lib/hooks/useUser';
import {network} from '../../lib/network';

export default function Login() {
  const {mutate: userMutate} = useUser();
  const {mutate: projectsMutate} = useProjects();
  const router = useRouter();

  const form = useForm<z.infer<typeof AuthenticationSchemas.login>>({
    resolver: zodResolver(AuthenticationSchemas.login),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resetError, setResetError] = useState<string | null>(null);

  async function onSubmit(values: z.infer<typeof AuthenticationSchemas.login>) {
    try {
      const response = await network.fetch<
        {
          success: boolean;
          data: {id: string; email: string};
        },
        typeof AuthenticationSchemas.login
      >('POST', '/auth/login', values);

      if (!response.success) {
        setErrorMessage('Email or password is not correct');
      } else {
        setErrorMessage(null);

        await userMutate();
        await projectsMutate();

        await router.push('/');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong');
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetStatus('loading');
    setResetError(null);
    try {
      const response = await network.fetch<{success: boolean}, typeof AuthenticationSchemas.resetPassword>(
        'POST',
        '/users/reset-password',
        {
          email: resetEmail,
        },
      );

      if (response.success) {
        setResetStatus('success');
      } else {
        setResetStatus('error');
        setResetError('Something went wrong.');
      }
    } catch {
      setResetStatus('error');
      setResetError('Something went wrong.');
    }
  }

  return (
    <div className={'h-screen flex items-center justify-center bg-neutral-50'}>
      <div className={'flex flex-col gap-6 max-w-4xl w-full px-4'}>
        <Card className="overflow-hidden">
          <CardContent className="grid p-0 md:grid-cols-2">
            <Form {...form}>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void form.handleSubmit(onSubmit)(e);
                }}
                className="p-6 md:p-8"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col items-center text-center">
                    <h1 className="text-2xl font-bold">Welcome back</h1>
                    <p className="text-balance text-neutral-500">Login to your Plunk account</p>
                  </div>
                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="hello@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input placeholder="password" type={'password'} {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <button
                      type="button"
                      className="text-xs underline mt-1 text-left text-neutral-500"
                      onClick={() => setShowReset(true)}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <AnimatePresence>
                    {errorMessage && (
                      <motion.p
                        initial={{opacity: 0, y: -10}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -10}}
                        className="text-sm font-medium text-red-500"
                      >
                        {errorMessage}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.div layout>
                    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? (
                        <>
                          <svg
                            className="h-4 w-4 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        </>
                      ) : (
                        'Login'
                      )}
                    </Button>
                  </motion.div>

                  <div className="text-center text-sm text-neutral-500">
                    Don&apos;t have an account?{' '}
                    <Link href="/auth/signup" className="underline underline-offset-4 hover:text-neutral-900">
                      Sign up
                    </Link>
                  </div>
                </div>
              </form>
            </Form>
            <div className="relative hidden md:flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-50">
              <div className="text-6xl font-bold text-neutral-900">Plunk</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showReset}
        onOpenChange={open => {
          setShowReset(open);
          if (!open) {
            setResetStatus('idle');
            setResetEmail('');
            setResetError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>Enter your email to receive a password reset link.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              void handleResetPassword(e);
            }}
            className="flex flex-col gap-3 mt-2"
          >
            <Input
              type="email"
              placeholder="Enter your email"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              required
            />
            <DialogFooter>
              <div className={'w-full space-y-2'}>
                <Button className={'w-full block'} type="submit" disabled={resetStatus === 'loading'}>
                  {resetStatus === 'loading' ? 'Sending...' : 'Send reset link'}
                </Button>
                {resetStatus === 'success' && (
                  <p className="text-green-600 text-sm">
                    If an account exists, a reset link has been sent to your email.
                  </p>
                )}
                {resetStatus === 'error' && <p className="text-red-500 text-sm">{resetError}</p>}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
