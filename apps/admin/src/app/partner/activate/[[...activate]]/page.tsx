import Link from "next/link";
import Image from "next/image";
import { SignUp } from "@clerk/nextjs";
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
      <span className="d-eyebrow">YOUR PARTNER INVITATION</span>
      <h1>Make it your workspace.</h1>
      <p>
        Use your approved business email and set your own password. Your
        business logo will be waiting in your dashboard.
      </p>
      {hasClerkKeys() ? (
        <SignUp
          routing="path"
          path="/partner/activate"
          signInUrl="/partner/sign-in"
          forceRedirectUrl="/partner"
        />
      ) : (
        <div className="d-note">
          Open the setup invitation sent by iGO after approval. If you already
          have an account, <Link href="/partner/sign-in">sign in here</Link>.
        </div>
      )}
      <Link href="/join">Business application</Link>
    </main>
  );
}
