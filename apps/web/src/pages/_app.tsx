import '../styles/globals.css';
import type {AppProps} from 'next/app';
import {useRouter} from 'next/router';
import React, {useEffect} from 'react';
import {Toaster} from 'sonner';
import {SWRConfig} from 'swr';
import {ActiveProjectProvider} from '../lib/contexts/ActiveProjectProvider';
import {useProjects} from '../lib/hooks/useProject';
import {useUser} from '../lib/hooks/useUser';
import {network} from '../lib/network';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/auth/login', '/auth/signup', '/auth/reset'];

// Routes that don't require a project
const NO_PROJECT_ROUTES = ['/projects/create'];

function App({Component, pageProps}: AppProps) {
  return (
    <>
      <Component {...pageProps} />
    </>
  );
}

function AuthGuard({children}: {children: React.ReactNode}) {
  const {data: user, isLoading} = useUser();
  const router = useRouter();
  const isPublicRoute = PUBLIC_ROUTES.includes(router.pathname);

  useEffect(() => {
    // If not loading, no user, and trying to access a protected route, redirect to login
    if (!isLoading && !user && !isPublicRoute) {
      void router.push('/auth/login');
    }

    // If user is logged in and trying to access login/signup, redirect to home
    if (!isLoading && user && (router.pathname === '/auth/login' || router.pathname === '/auth/signup')) {
      void router.push('/');
    }
  }, [user, isLoading, router, isPublicRoute]);

  // Show loading state while checking authentication (only for protected routes)
  if (isLoading && !isPublicRoute) {
    return (
      <div className="h-screen flex items-center justify-center">
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
          <p className="mt-2 text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render protected content if redirecting
  if (!user && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}

function ProjectGuard({children}: {children: React.ReactNode}) {
  const {data: projects, isLoading} = useProjects();
  const router = useRouter();
  const isNoProjectRoute = NO_PROJECT_ROUTES.includes(router.pathname);

  useEffect(() => {
    // If not loading, user has no projects, and not already on project creation page
    if (!isLoading && projects && projects.length === 0 && !isNoProjectRoute) {
      void router.push('/projects/create');
    }
  }, [projects, isLoading, router, isNoProjectRoute]);

  // Show loading state while checking projects (only for routes that need a project)
  if (isLoading && !isNoProjectRoute) {
    return (
      <div className="h-screen flex items-center justify-center">
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
          <p className="mt-2 text-sm text-neutral-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render protected content if redirecting
  if (!isLoading && projects && projects.length === 0 && !isNoProjectRoute) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Main app root component that houses all components
 * @param props Default nextjs props
 */
export default function WithProviders(props: AppProps) {
  return (
    <SWRConfig
      value={{
        fetcher: (url: string) => network.fetch('GET', url),
        shouldRetryOnError: false,
      }}
    >
      <ActiveProjectProvider>
        <Root {...props} />
      </ActiveProjectProvider>
    </SWRConfig>
  );
}

function Root(props: AppProps) {
  const router = useRouter();
  const isPublicRoute = PUBLIC_ROUTES.includes(router.pathname);

  return (
    <>
      <Toaster position={'top-right'} />

      <div>
        <AuthGuard>
          {isPublicRoute ? (
            <App {...props} />
          ) : (
            <ProjectGuard>
              <App {...props} />
            </ProjectGuard>
          )}
        </AuthGuard>
      </div>
    </>
  );
}
