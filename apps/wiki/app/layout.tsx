import './global.css';
import {DocsLayout} from 'fumadocs-ui/layouts/docs';
import {RootProvider} from 'fumadocs-ui/provider/next';
import {Inter} from 'next/font/google';
import Script from 'next/script';
import type {ReactNode} from 'react';
import React from 'react';

import {baseOptions} from '@/app/layout.config';
import {source} from '@/lib/source';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/favicon/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="Swyp" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
      </head>
      <body className="flex flex-col min-h-screen antialiased text-neutral-800" suppressHydrationWarning>
        <RootProvider
          theme={{
            enabled: false,
          }}
        >
          <DocsLayout tree={source.pageTree} {...baseOptions}>
            {children}
          </DocsLayout>
        </RootProvider>
      </body>

      <Script
        defer
        type="text/javascript"
        src="https://analytics.driaug.com/script.js"
        id="umami-analytics"
        data-website-id="bc72ec32-3028-45d2-ac04-787784d40dbb"
      ></Script>
    </html>
  );
}
