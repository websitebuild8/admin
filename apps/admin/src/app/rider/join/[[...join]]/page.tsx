import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
export default async function Page() {
  if ((await auth()).userId) redirect("/rider");
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
        <span className="d-eyebrow">BECOME A RIDER</span>
        <h1>
          Your city.
          <br />
          Your next delivery.
        </h1>
        <p>
          Create your account, then send your contact details for review.
          Deliveries open after iGO approves your application.
        </p>
        <SignUp
          routing="path"
          path="/rider/join"
          signInUrl="/rider/sign-in"
          forceRedirectUrl="/rider"
        />
        <Link href="/rider/sign-in">Already applied? Rider sign in →</Link>
        <Link href="/join">Own a business? Apply as a partner</Link>
      </main>
    </PublicPageTransition>
  );
}
