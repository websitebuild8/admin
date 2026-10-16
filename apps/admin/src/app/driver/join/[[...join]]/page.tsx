import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { hasClerkKeys } from "@/lib/mode";
export default function Page() {
  return (
    <main className="d-auth">
      <h1>Join the delivery team.</h1>
      <p>
        Create your driver account, then submit your details for admin approval.
      </p>
      {hasClerkKeys() && (
        <SignUp
          routing="path"
          path="/driver/join"
          signInUrl="/rider/sign-in"
          forceRedirectUrl="/rider"
        />
      )}
      <Link href="/join">Business owners: apply as a partner</Link>
    </main>
  );
}
