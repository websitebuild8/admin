import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
export default function Page() {
  return (
    <PublicPageTransition>
      <main className="r-auth d-auth">
        <Link href="/" className="d-auth-brand">
          <Image
            src="/brand/igo-delivery.jpg"
            alt="iGO Delivery"
            width={160}
            height={90}
            priority
          />
        </Link>
        <span className="d-eyebrow">RIDER SIGN IN</span>
        <h1>Ready for your next stop?</h1>
        <p>
          Use the account you applied with. Your assignments are available after
          admin approval.
        </p>
        <SignIn
          routing="path"
          path="/rider/sign-in"
          signUpUrl="/rider/join"
          forceRedirectUrl="/rider"
        />
        <Link href="/rider/join">New to the team? Become a rider →</Link>
      </main>
    </PublicPageTransition>
  );
}
