import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { themeScriptInline } from '@/lib/theme/theme-script';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CarteiraExpert — Consolidação e Gestão Patrimonial',
  description: 'Plataforma inteligente para consolidação e acompanhamento patrimonial.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const nonce = headerList.get('x-nonce') ?? undefined;

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          id="theme-initializer-script"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeScriptInline }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-text-primary">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
