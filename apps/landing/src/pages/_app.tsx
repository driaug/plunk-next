import '../styles/globals.css';
import type {AppProps} from 'next/app';
import React from 'react';
import {Toaster} from 'sonner';

function App({Component, pageProps}: AppProps) {
  return (
    <>
      <Component {...pageProps} />
    </>
  );
}

/**
 * Main app root component that houses all components
 * @param props Default nextjs props
 */
export default function WithProviders(props: AppProps) {
  return <Root {...props} />;
}

function Root(props: AppProps) {
  return (
    <>
      <Toaster position={'top-right'} />

      <div>
        <App {...props} />
      </div>
    </>
  );
}
