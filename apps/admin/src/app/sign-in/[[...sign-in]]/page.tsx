import Image from 'next/image';
import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { hasClerkKeys, isDemoMode } from '@/lib/mode';
export default function Page() {
  if (isDemoMode()) redirect('/');
  if (!hasClerkKeys()) redirect('/setup');
  return <main className="setup-page"><div className="login-brand"><Image className="login-logo" src="/brand/igo-logo.jpg" alt="iGO — You Order. I Go." width={160} height={160} priority/><h1>Your city, in good hands.</h1><p>Sign in with your approved administrator account.</p></div><SignIn routing="path" path="/sign-in" withSignUp={false} transferable={false}/></main>;
}
