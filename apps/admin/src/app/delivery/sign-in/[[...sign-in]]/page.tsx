import Image from "next/image";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { hasClerkKeys } from "@/lib/mode";
export default function Page() {
  return (
    <main className="d-auth">
      <Link href="/" className="d-auth-brand">
        <Image
          src="/brand/igo-delivery.jpg"
          width={240}
          height={135}
          alt="iGO Delivery. You order. I go."
          priority
        />
      </Link>
      <h1>Welcome back.</h1>
      <p>
        Administrator and driver sign-in. Business owners use the separate{" "}
        <Link href="/partner/sign-in">partner sign-in</Link>.
      </p>
      {hasClerkKeys() ? (
        <SignIn
          routing="path"
          path="/delivery/sign-in"
          signUpUrl="/driver/join"
          forceRedirectUrl="/delivery"
        />
      ) : (
        <p role="alert">Clerk authentication needs server configuration.</p>
      )}
    </main>
  );
}
