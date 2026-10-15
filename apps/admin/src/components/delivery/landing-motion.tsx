"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: the server-rendered page is visible without JavaScript. */
export function LandingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const phone = window.matchMedia("(max-width: 760px)");
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const hero = root.querySelector<HTMLElement>(".d-hero");
    const visual = root.querySelector<HTMLElement>(".d-hero-visual");
    let stopMotion = () => {};

    function configureMotion() {
      stopMotion();
      if (preference.matches || !("IntersectionObserver" in window)) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            if (
              entry.isIntersecting ||
              target.contains(document.activeElement)
            ) {
              target.dataset.revealState = "shown";
            } else {
              // Reset beyond the viewport. Move away from the edge we left so
              // the transform cannot trigger repeated intersection callbacks.
              target.dataset.revealFrom =
                entry.boundingClientRect.bottom <= 0 ? "above" : "below";
              target.dataset.revealState = "pending";
            }
          }
        },
        { rootMargin: "32px 0px", threshold: 0 },
      );

      for (const target of targets) {
        // Keep initial and restored scroll positions readable immediately.
        const { top, bottom } = target.getBoundingClientRect();
        if (bottom <= 0 || top >= window.innerHeight) {
          target.dataset.revealFrom = bottom <= 0 ? "above" : "below";
          target.dataset.revealState = "pending";
        }
        observer.observe(target);
      }

      let frame = 0;
      function updateParallax() {
        frame = 0;
        if (!hero || !visual) return;
        const { top, height, bottom } = hero.getBoundingClientRect();
        if (bottom < 0 || top > window.innerHeight) return;
        const progress = Math.max(
          -1,
          Math.min(1, (window.innerHeight / 2 - top - height / 2) / height),
        );
        visual.style.setProperty(
          "--d-parallax-y",
          `${(progress * (phone.matches ? 14 : 48)).toFixed(2)}px`,
        );
      }
      function scheduleParallax() {
        // One paint per scroll frame, with no idle animation loop or React updates.
        if (!frame) frame = window.requestAnimationFrame(updateParallax);
      }
      function revealFocusedContent(event: FocusEvent) {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest<HTMLElement>("[data-reveal]");
        if (!target) return;
        target.dataset.revealState = "shown";
      }

      scheduleParallax();
      window.addEventListener("scroll", scheduleParallax, { passive: true });
      window.addEventListener("resize", scheduleParallax);
      root!.addEventListener("focusin", revealFocusedContent);

      stopMotion = () => {
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        window.removeEventListener("scroll", scheduleParallax);
        window.removeEventListener("resize", scheduleParallax);
        root!.removeEventListener("focusin", revealFocusedContent);
        visual?.style.removeProperty("--d-parallax-y");
        for (const target of targets) {
          delete target.dataset.revealState;
          delete target.dataset.revealFrom;
        }
      };
    }

    configureMotion();
    preference.addEventListener("change", configureMotion);
    return () => {
      stopMotion();
      preference.removeEventListener("change", configureMotion);
    };
  }, []);

  return (
    <div className="d-site" ref={rootRef}>
      {children}
    </div>
  );
}
