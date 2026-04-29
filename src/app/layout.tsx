import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Internal API Push Tool',
  description: 'Tauri internal API push and signature tool'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
