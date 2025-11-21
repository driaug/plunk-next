import {zodResolver} from '@hookform/resolvers/zod';
import {ProjectSchemas} from '@repo/shared';
import {
  Button,
  Card,
  CardContent,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import {AnimatePresence, motion} from 'framer-motion';
import {useRouter} from 'next/router';
import React, {useState} from 'react';
import {useForm} from 'react-hook-form';
import type {z} from 'zod';

import {useProjects} from '../../lib/hooks/useProject';
import {network} from '../../lib/network';

export default function CreateProject() {
  const {mutate: projectsMutate} = useProjects();
  const router = useRouter();

  const form = useForm<z.infer<typeof ProjectSchemas.create>>({
    resolver: zodResolver(ProjectSchemas.create),
    defaultValues: {
      name: '',
    },
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(values: z.infer<typeof ProjectSchemas.create>) {
    try {
      await network.fetch<{success: boolean}, typeof ProjectSchemas.create>('POST', '/users/@me/projects', values);

      // Refresh the projects list
      await projectsMutate();

      // Redirect to dashboard
      await router.push('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Something went wrong');
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
                    <h1 className="text-2xl font-bold">Create your first project</h1>
                    <p className="text-balance text-neutral-500">
                      Get started by creating a project to organize your emails
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({field}) => (
                        <FormItem>
                          <FormLabel>Project Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Awesome Project" {...field} />
                          </FormControl>
                          <FormDescription>
                            Choose a descriptive name for your project. You can always change it later.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                        'Create Project'
                      )}
                    </Button>
                  </motion.div>
                </div>
              </form>
            </Form>
            <div className="relative hidden md:flex items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-50">
              <div className="text-center px-8">
                <div className="text-6xl font-bold text-neutral-900 mb-4">Plunk</div>
                <p className="text-neutral-600 text-sm">
                  Organize your email campaigns, contacts, and analytics in one place
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
