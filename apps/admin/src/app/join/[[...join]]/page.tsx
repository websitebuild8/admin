import Image from "next/image";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { hasClerkKeys } from "@/lib/mode";
export default function Page() {
  return (
    <main className="d-auth">
      <Link href="/" className="d-auth-brand">
        <Image
          src="/brand/igo-delivery.jpg"
          width={240}
          height={135}
          alt="iGO Delivery"
          priority
        />
      </Link>
      <h1>A little closer to your customers.</h1>
      <p>
        Create your account, then apply as a partner page or driver. Admin
        approval is required.
      </p>
      {hasClerkKeys() ? (
        <SignUp
          routing="path"
          path="/join"
          signInUrl="/delivery/sign-in"
          forceRedirectUrl="/delivery"
        />
      ) : (
        <p role="alert">Clerk registration needs server configuration.</p>
      )}
    </main>
  );
}
