import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

// Force all pages to render dynamically (at request time) instead of at build time.
// This prevents Firebase initialization errors during static generation.
export const dynamic = 'force-dynamic';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Story Creator — Build Interactive AI Visual Novels',
  description:
    'Create multi-character interactive stories with AI-powered dialogue. Build scenes, design characters, and let players experience your visual novel.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} antialiased text-white min-h-screen`} style={{ background: '#0f0f1e' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
