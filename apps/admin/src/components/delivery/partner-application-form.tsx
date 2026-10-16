"use client";

import {
  ViewTransition,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { partnerApplicationInput } from "@/lib/delivery/partner-application-input";

const businessTypes = [
  { value: "FACEBOOK", label: "Facebook page" },
  { value: "INSTAGRAM", label: "Instagram page" },
  { value: "BUSINESS", label: "Other business" },
];
const areas = [
  { value: "Malé", label: "Malé" },
  { value: "Hulhumalé", label: "Hulhumalé" },
];

export function PartnerApplicationForm() {
  const [businessType, setBusinessType] = useState("FACEBOOK");
  const [pickupArea, setPickupArea] = useState("Malé");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const retry = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function changed() {
    retry.current = null;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = partnerApplicationInput.safeParse({
      ...Object.fromEntries(
        [
          "businessName",
          "pageUrl",
          "ownerName",
          "email",
          "phone",
          "pickupAddress",
          "dailyDeliveries",
        ].map((name) => [name, String(form.get(name) ?? "")]),
      ),
      businessType,
      pickupArea,
      contactConsent: consent,
    });
    setError("");
    setFields({});
    if (!input.success) {
      setFields(
        Object.fromEntries(
          input.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      );
      setError("Please check the highlighted details.");
      return;
    }
    if (
      !file ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 3 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG or WebP business logo up to 3 MB.");
      return;
    }
    form.set("businessType", businessType);
    form.set("pickupArea", pickupArea);
    form.set("contactConsent", String(consent));
    form.set("logo", file);
    setBusy(true);
    retry.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/partner-applications", {
        method: "POST",
        headers: { "Idempotency-Key": retry.current },
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not submit your application.");
      setReference(result.reference);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not submit. Keep the form open and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  function field(
    name: string,
    label: string,
    options: {
      type?: string;
      placeholder?: string;
      autoComplete?: string;
      required?: boolean;
      maxLength?: number;
    } = {},
  ) {
    return (
      <div className="d-field">
        <Label htmlFor={`application-${name}`}>{label}</Label>
        <Input
          id={`application-${name}`}
          name={name}
          type={options.type ?? "text"}
          required={options.required ?? true}
          maxLength={options.maxLength ?? 120}
          placeholder={options.placeholder}
          autoComplete={options.autoComplete}
          aria-invalid={!!fields[name]}
          aria-describedby={fields[name] ? `error-${name}` : undefined}
        />
        <span className="d-field-error" id={`error-${name}`}>
          {fields[name]}
        </span>
      </div>
    );
  }
  return (
    <main className="d-partner-join">
      <ViewTransition enter="d-join-header-motion" default="none">
        <header className="d-join-header">
          <Link
            href="/"
            transitionTypes={["igo-back"]}
            aria-label="iGO Delivery home"
          >
            <Image
              src="/brand/igo-delivery.jpg"
              width={108}
              height={61}
              alt="iGO Delivery"
              priority
            />
          </Link>
          <Link href="/partner/sign-in">
            Already approved?{" "}
            <strong>
              Partner sign in <ArrowRight size={15} />
            </strong>
          </Link>
        </header>
      </ViewTransition>
      <div className="d-join-layout">
        <ViewTransition enter="d-join-intro-motion" default="none">
          <aside className="d-join-intro">
            <Link
              href="/"
              transitionTypes={["igo-back"]}
              className="d-back-link"
            >
              <ArrowLeft size={15} /> Back to home
            </Link>
            <span className="d-eyebrow">FOR THE BUSINESSES GOING PLACES</span>
            <h1>
              Your business.
              <br />
              Our next stop.
            </h1>
            <p>
              From your Facebook page, Instagram shop or growing business to
              your customer’s doorstep.
            </p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Tell us about your business</strong>
                  <p>A few details, your logo, and where we collect.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>We review your application</strong>
                  <p>Our team checks the details before approving access.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Your own delivery workspace</strong>
                  <p>
                    Receive your setup invitation, then manage your packages,
                    invoices and collections.
                  </p>
                </div>
              </li>
            </ol>
            <p className="d-join-footnote">
              Made for Malé and Hulhumalé businesses. You order. I go.
            </p>
          </aside>
        </ViewTransition>
        <ViewTransition enter="d-join-card-motion" default="none">
          <section
            className="d-join-card"
            aria-label="Partner business application"
          >
            {reference ? (
              <div className="d-join-success" role="status">
                <div className="d-join-success-mark">
                  <Check size={28} />
                </div>
                <span className="d-eyebrow">APPLICATION RECEIVED</span>
                <h2>You’re on the list.</h2>
                <p>
                  Your application is awaiting admin review. If approved, iGO
                  will send a setup invitation to the email you provided. You
                  will then set your own password.
                </p>
                <div className="d-note">
                  <small>YOUR APPLICATION REFERENCE</small>
                  <strong>{reference}</strong>
                </div>
                <p>
                  Your application does not create an administrator account or
                  grant access to deliveries.
                </p>
                <Link href="/" transitionTypes={["igo-back"]}>
                  <Button>
                    Back to home <ArrowRight size={16} />
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <span className="d-eyebrow">BECOME AN iGO PARTNER</span>
                <h2>A little about your business.</h2>
                <p>
                  No login needed to apply. Your dashboard opens after review
                  and invitation.
                </p>
                <form
                  onSubmit={submit}
                  onChange={changed}
                  className="d-join-form"
                >
                  <fieldset disabled={busy}>
                    <legend>01 — Your business</legend>
                    <div className="d-form">
                      <div className="d-field">
                        <Label htmlFor="business-type">Business type</Label>
                        <Select
                          items={businessTypes}
                          value={businessType}
                          onValueChange={(value) => {
                            setBusinessType(String(value));
                            changed();
                          }}
                        >
                          <SelectTrigger id="business-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {businessTypes.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {field("businessName", "Business / page name", {
                        autoComplete: "organization",
                      })}
                      <div className="full">
                        {field(
                          "pageUrl",
                          businessType === "BUSINESS"
                            ? "Website or social page (optional)"
                            : "Facebook / Instagram page link",
                          {
                            type: "url",
                            required: businessType !== "BUSINESS",
                            placeholder:
                              businessType === "INSTAGRAM"
                                ? "https://www.instagram.com/yourbusiness"
                                : "https://www.facebook.com/yourbusiness",
                            maxLength: 500,
                          },
                        )}
                      </div>
                      <div className="d-field full">
                        <Label htmlFor="business-logo">Business logo</Label>
                        <div className="d-logo-upload">
                          {preview ? (
                            <Image
                              src={preview}
                              alt="Your business logo preview"
                              width={72}
                              height={72}
                              unoptimized
                            />
                          ) : (
                            <div className="d-logo-placeholder">
                              <Upload size={22} />
                            </div>
                          )}
                          <div>
                            <Input
                              id="business-logo"
                              name="logo"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              required
                              onChange={(event) => {
                                const image = event.target.files?.[0] ?? null;
                                setFile(image);
                                setPreview(
                                  image &&
                                    [
                                      "image/jpeg",
                                      "image/png",
                                      "image/webp",
                                    ].includes(image.type)
                                    ? URL.createObjectURL(image)
                                    : "",
                                );
                                changed();
                              }}
                            />
                            <p>
                              JPG, PNG or WebP · up to 3 MB · at least 64 × 64
                              pixels. We resize it to fit your dashboard.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </fieldset>
                  <fieldset disabled={busy}>
                    <legend>02 — The person behind the business</legend>
                    <div className="d-form">
                      {field("ownerName", "Owner / manager name", {
                        autoComplete: "name",
                      })}
                      {field("phone", "Contact number", {
                        type: "tel",
                        placeholder: "7771234",
                        autoComplete: "tel",
                        maxLength: 12,
                      })}
                      <div className="full">
                        {field("email", "Business email / future login email", {
                          type: "email",
                          autoComplete: "email",
                          maxLength: 254,
                        })}
                      </div>
                    </div>
                  </fieldset>
                  <fieldset disabled={busy}>
                    <legend>03 — Your deliveries</legend>
                    <div className="d-form">
                      <div className="d-field">
                        <Label htmlFor="pickup-area">Pickup island</Label>
                        <Select
                          items={areas}
                          value={pickupArea}
                          onValueChange={(value) => {
                            setPickupArea(String(value));
                            changed();
                          }}
                        >
                          <SelectTrigger id="pickup-area">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {areas.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="d-field">
                        <Label htmlFor="application-dailyDeliveries">
                          Approximate deliveries per day
                        </Label>
                        <Input
                          id="application-dailyDeliveries"
                          name="dailyDeliveries"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={10000}
                          step={1}
                          required
                          placeholder="e.g. 10"
                          aria-invalid={!!fields.dailyDeliveries}
                        />
                        <span className="d-field-error">
                          {fields.dailyDeliveries}
                        </span>
                      </div>
                      <div className="d-field full">
                        <Label htmlFor="application-pickupAddress">
                          Pickup address and collection instructions
                        </Label>
                        <Textarea
                          id="application-pickupAddress"
                          name="pickupAddress"
                          required
                          minLength={5}
                          maxLength={500}
                          rows={3}
                          autoComplete="street-address"
                          placeholder="Building / house name, street, floor and who to contact at pickup"
                          aria-invalid={!!fields.pickupAddress}
                        />
                        <span className="d-field-error">
                          {fields.pickupAddress}
                        </span>
                      </div>
                    </div>
                  </fieldset>
                  <div className="d-form-trap" aria-hidden="true">
                    <Label htmlFor="application-website">
                      Leave this field empty
                    </Label>
                    <Input
                      id="application-website"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>
                  <Label className="d-check-label">
                    <Checkbox
                      checked={consent}
                      onCheckedChange={(value) => {
                        setConsent(!!value);
                        changed();
                      }}
                      disabled={busy}
                    />
                    I confirm I own or manage this business and may be contacted
                    about this application.
                  </Label>
                  <p className="d-join-privacy">
                    Your contact details and logo are saved privately for iGO’s
                    review and your future partner workspace. Applying does not
                    create a login or approve your business.
                  </p>
                  {error && (
                    <div className="d-error" role="alert">
                      {error}
                    </div>
                  )}
                  <Button type="submit" disabled={busy || !consent}>
                    {busy ? (
                      <>
                        <Loader2 className="animate-spin" size={16} /> Saving
                        your application…
                      </>
                    ) : (
                      <>
                        Submit for review <ArrowRight size={17} />
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </section>
        </ViewTransition>
      </div>
    </main>
  );
}
