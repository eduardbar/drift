import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HeaderHero } from "./components/HeaderHero";
import { IntroSection } from "./components/IntroSection";
import { WhySection } from "./components/WhySection";
import { FeaturesSection } from "./components/FeaturesSection";
import { FlowSection } from "./components/FlowSection";
import { CommandsSection } from "./components/CommandsSection";
import { PlatformSection } from "./components/PlatformSection";
import { FaqSection } from "./components/FaqSection";
import { FinalCtaSection } from "./components/FinalCtaSection";
import { SiteFooter } from "./components/SiteFooter";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function App() {
  const rootRef = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          desktop: "(min-width: 961px)"
        },
        (context) => {
          const { reduceMotion, desktop } = context.conditions;

          if (reduceMotion) {
            gsap.set(
              [
                ".js-hero-copy",
                ".js-hero-panel",
                ".js-terminal-line",
                ".js-reveal",
                ".js-stagger",
                ".js-scrub"
              ],
              { clearProps: "all", autoAlpha: 1 }
            );
            return;
          }

          gsap.set([".js-hero-copy", ".js-hero-panel"], { autoAlpha: 0, y: 24 });
          gsap.set(".js-terminal-line", { autoAlpha: 0, x: -14 });

          const heroTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });

          heroTimeline
            .to(".js-hero-copy", { autoAlpha: 1, y: 0, duration: 0.72 })
            .to(".js-hero-panel", { autoAlpha: 1, y: 0, duration: 0.66 }, "<0.08")
            .to(
              ".js-terminal-line",
              { autoAlpha: 1, x: 0, duration: 0.34, stagger: { each: 0.09 } },
              "<0.12"
            );

          ScrollTrigger.batch(".js-reveal", {
            start: "top 85%",
            once: true,
            onEnter: (items) => {
              gsap.fromTo(
                items,
                { y: 26, autoAlpha: 0 },
                {
                  y: 0,
                  autoAlpha: 1,
                  duration: 0.62,
                  ease: "power2.out",
                  stagger: { each: 0.1, from: "start" },
                  overwrite: "auto"
                }
              );
            }
          });

          gsap.from(".js-stagger", {
            y: 18,
            autoAlpha: 0,
            duration: 0.52,
            ease: "power2.out",
            stagger: { each: 0.1 },
            scrollTrigger: {
              trigger: "#features",
              start: "top 76%",
              toggleActions: "play none none none"
            }
          });

          if (desktop) {
            gsap.to(".js-scrub", {
              yPercent: -11,
              ease: "none",
              scrollTrigger: {
                trigger: ".hero",
                start: "top top",
                end: "bottom top",
                scrub: 0.9
              }
            });
          }

          gsap.to(".scroll-indicator-bar", {
            scaleX: 1,
            ease: "none",
            transformOrigin: "0% 50%",
            scrollTrigger: {
              trigger: "body",
              start: "top top",
              end: "bottom bottom",
              scrub: true
            }
          });
        }
      );

      return () => {
        mm.revert();
      };
    },
    { scope: rootRef }
  );

  return (
    <div className="page" ref={rootRef}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="scroll-indicator" aria-hidden="true">
        <div className="scroll-indicator-bar" />
      </div>
      <HeaderHero />
      <main id="main-content">
        <IntroSection />
        <WhySection />
        <FeaturesSection />
        <FlowSection />
        <CommandsSection />
        <PlatformSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
