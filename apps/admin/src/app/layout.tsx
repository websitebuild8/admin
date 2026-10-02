import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import { hasClerkKeys, isDemoMode } from '@/lib/mode';
import './globals.css';


export const metadata: Metadata = { title: 'iGO — Admin workspace', description: 'Restaurant, rider and delivery operations for iGO.', icons: { icon: { url: '/brand/igo-logo.jpg', type: 'image/jpeg' }, apple: '/brand/igo-logo.jpg' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <>{children}<Toaster position="bottom-right" richColors/></>;
  return <html lang="en"><body>{!isDemoMode() && hasClerkKeys() ? <ClerkProvider>{content}</ClerkProvider> : content}</body></html>;
}
