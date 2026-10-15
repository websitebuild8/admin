import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import { hasClerkKeys } from '@/lib/mode';
import './globals.css';


export const metadata: Metadata = { title: 'iGO Delivery — You order. I go.', description: 'Delivery management for online sellers in the Maldives.', icons: { icon: { url: '/brand/igo-delivery.jpg', type: 'image/jpeg' }, apple: '/brand/igo-delivery.jpg' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <>{children}<Toaster position="bottom-right" richColors/></>;
  return <html lang="en"><body>{hasClerkKeys() ? <ClerkProvider>{content}</ClerkProvider> : content}</body></html>;
}
