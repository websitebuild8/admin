import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Package,
  MapPin,
  Check,
  ArrowUpRight,
  Truck,
  FileSpreadsheet,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PublicRates,
  PublicRatesSkeleton,
} from "@/components/delivery/public-rates";
import { LandingMotion } from "@/components/delivery/landing-motion";
import { PublicPageTransition } from "@/components/delivery/public-page-transition";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <PublicPageTransition>
      <LandingMotion>
        <header className="d-site-header">
          <Link href="/" aria-label="iGO Delivery home">
            <Image
              src="/brand/igo-delivery.jpg"
              width={108}
              height={61}
              alt="iGO Delivery"
              priority
            />
          </Link>
          <nav aria-label="Main navigation">
            <a className="d-nav-section" href="#how-it-works">
              How it works
            </a>
            <a className="d-nav-section" href="#delivery-rates">
              Delivery rates
            </a>
            <Link
              className="d-nav-rider"
              href="/rider/join"
              transitionTypes={["igo-forward"]}
            >
              Become a rider <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link
              className="d-nav-sign-in"
              href="/partner/sign-in"
              aria-label="Partner sign in"
            >
              Sign in <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </nav>
        </header>
        <main>
          <section className="d-hero">
            <div>
              <span className="d-eyebrow">
                <span className="d-live-dot" /> MADE FOR YOUR ISLANDS
              </span>
              <h1>
                You make
                <br />
                the sale.
                <br />
                <span>
                  We make
                  <br className="d-only-mobile" /> the move.
                </span>
              </h1>
              <p>
                From your page to their doorstep. A delivery partner for the
                businesses building something of their own.
              </p>
              <div className="d-hero-actions">
                <Link href="/join" transitionTypes={["igo-forward"]}>
                  <Button size="lg">
                    Let’s get your business moving <ArrowRight size={18} />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  See how it works <ArrowUpRight size={16} />
                </a>
              </div>
              <div className="d-hero-note">
                <ShieldCheck size={17} /> Malé · Hulhumalé · Boat deliveries
              </div>
            </div>
            <div className="d-hero-visual" data-reveal>
              <div
                className="d-hero-art"
                aria-label="From your business to your customer"
              >
                <div className="d-art-brand">
                  <Image
                    src="/brand/igo-delivery.jpg"
                    width={440}
                    height={248}
                    alt="You order. I go."
                    priority
                  />
                </div>
                <div className="d-route-card">
                  <div className="d-route-icon">
                    <Package size={26} />
                  </div>
                  <div>
                    <small>COLLECT FROM</small>
                    <strong>Your business</strong>
                  </div>
                  <span className="d-mini-badge">STEP 01</span>
                </div>
                <div className="d-route-line">
                  <span />
                  <span />
                  <span />
                  <Truck size={26} />
                  <span />
                  <span />
                </div>
                <div className="d-route-card destination">
                  <div className="d-route-icon">
                    <MapPin size={26} />
                  </div>
                  <div>
                    <small>DELIVER TO</small>
                    <strong>A happy customer</strong>
                  </div>
                  <div className="d-check-icon">
                    <Check size={21} />
                  </div>
                </div>
                <div className="d-art-caption">
                  <span>Less delivery admin.</span>
                  <strong>More room to grow.</strong>
                </div>
              </div>
            </div>
          </section>
          <section id="how-it-works" className="d-how">
            <div data-reveal>
              <span className="d-eyebrow">
                SMALL BUSINESS. BIG POSSIBILITIES.
              </span>
              <h2>
                Your next delivery,
                <br />
                without the back-and-forth.
              </h2>
            </div>
            <div className="d-feature-grid">
              {[
                {
                  icon: FileSpreadsheet,
                  n: "01",
                  title: "Add your packages",
                  text: "Register one delivery or upload your Excel list. Keep every customer and parcel reference together.",
                },
                {
                  icon: Truck,
                  n: "02",
                  title: "We collect and deliver",
                  text: "Our driver confirms physical pickup and records delivery. See each milestone from your portal.",
                },
                {
                  icon: ReceiptText,
                  n: "03",
                  title: "Track your spending",
                  text: "Know how much you will spend from the start. No hidden fees.",
                },
              ].map(({ icon: Icon, n, title, text }) => (
                <article key={n} data-reveal>
                  <div>
                    <Icon size={25} />
                    <span>{n}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
          <section
            id="delivery-rates"
            className="d-public-rates"
            aria-labelledby="delivery-rates-title"
          >
            <div className="d-rate-section-intro">
              <div data-reveal>
                <span className="d-eyebrow">SIMPLE STARTING RATES</span>
                <h2 id="delivery-rates-title">
                  Small fees.
                  <br />A big weight off.
                </h2>
              </div>
              <div className="d-rate-section-note" data-reveal>
                <p>
                  Delivery fees depend on where your business operates and where
                  your package is going. Billed after confirmed delivery.
                </p>
                <Link href="/join" transitionTypes={["igo-forward"]}>
                  Apply for your partner account <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
            <Suspense fallback={<PublicRatesSkeleton />}>
              <PublicRates />
            </Suspense>
          </section>
          <section className="d-final-cta" data-reveal>
            <div>
              <span className="d-eyebrow">YOUR CUSTOMERS ARE WAITING.</span>
              <h2>Ready when you are.</h2>
              <p>
                Bring your Facebook or Instagram business. We’ll take it from
                here.
              </p>
            </div>
            <Link href="/join" transitionTypes={["igo-forward"]}>
              <Button size="lg">
                Apply as a partner <ArrowUpRight size={19} />
              </Button>
            </Link>
          </section>
        </main>
        <footer className="d-public-footer">
          <strong>
            iGO Delivery <span>You order. I go.</span>
          </strong>
          <p>Maldives · MVR · UTC+5</p>
          <Link href="/delivery/sign-in">
            Administrator & driver sign in <ArrowRight size={14} />
          </Link>
        </footer>
      </LandingMotion>
    </PublicPageTransition>
  );
}
