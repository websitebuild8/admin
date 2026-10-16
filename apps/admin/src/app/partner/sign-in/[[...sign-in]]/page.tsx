import Link from "next/link";
import Image from "next/image";
import { SignIn } from "@clerk/nextjs";
import { hasClerkKeys } from "@/lib/mode";
export default function Page() {
  return (
    <main className="d-auth">
      <Link href="/" className="d-auth-brand">
        <Image
          src="/brand/igo-delivery.jpg"
          alt="iGO Delivery"
          width={180}
          height={101}
          priority
        />
      </Link>
      <span className="d-eyebrow">PARTNER SIGN IN</span>
      <h1>Your business, delivered.</h1>
      <p>
        Use the email approved for your business. Set up your account from the
        invitation email first.
      </p>
      {hasClerkKeys() ? (
        <SignIn
          routing="path"
          path="/partner/sign-in"
          signUpUrl="/join"
          forceRedirectUrl="/partner"
        />
      ) : (
        <p role="alert">Partner sign-in needs Clerk configuration.</p>
      )}
      <Link href="/join">New business? Apply to become a partner</Link>
    </main>
  );
}
