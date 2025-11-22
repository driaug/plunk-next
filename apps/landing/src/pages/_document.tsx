import {Head, Html, Main, NextScript} from 'next/document';

function Document({locale}: {locale: string}) {
  return (
    <Html lang={locale}>
      <Head>
        {/* Runtime environment configuration - must load before any app code */}
        <script src="/__env.js" />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />

        {/* Favicon */}
        <link rel="icon" type="image/png" href="/favicon/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="Swyp" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
      </Head>
      <body className="antialiased cursor-default scroll-smooth text-neutral-800">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

export default Document;
