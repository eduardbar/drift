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

const FLOW_GLOW_INITIAL_Y = -10;
const REVEAL_LEFT_OFFSET = -34;
const FLOW_INACTIVE_OPACITY = 0.62;
const FLOW_ACTIVE_Y = -4;
const FLOW_ACTIVE_SCALE = 1.02;
const FLOW_INACTIVE_SCALE = 0.985;
const FLOW_ACTIVE_DURATION = 0.4;
const FLOW_INACTIVE_DURATION = 0.34;
const FLOW_GLOW_BASE_OPACITY = 0.42;
const FLOW_GLOW_OPACITY_STEP = 0.18;
const FLOW_GLOW_BASE_Y = -12;
const FLOW_GLOW_Y_STEP = 8;
const FLOW_GLOW_BASE_SCALE = 0.96;
const FLOW_GLOW_SCALE_STEP = 0.06;
const HERO_PARALLAX_PERCENT = -8;

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
                ".js-hero-nav",
                ".js-hero-kicker",
                ".js-hero-title-line",
                ".js-hero-sub",
                ".js-hero-proof",
                ".js-hero-actions",
                ".js-hero-footnote",
                ".js-hero-panel",
                ".js-terminal-line",
                ".js-hero-kpi",
                ".js-reveal",
                ".js-reveal-left",
                ".js-reveal-scale",
                ".js-divider-line",
                ".js-flow-stage",
                ".js-flow-meter",
                ".js-flow-glow"
              ],
              { clearProps: "all", autoAlpha: 1 }
            );
            return;
          }

          gsap.set(
            [
              ".js-hero-nav",
              ".js-hero-kicker",
              ".js-hero-title-line",
              ".js-hero-sub",
              ".js-hero-proof",
              ".js-hero-actions",
              ".js-hero-footnote"
            ],
            { autoAlpha: 0, y: 22 }
          );
          gsap.set([".js-hero-panel", ".js-terminal-line", ".js-hero-kpi"], {
            autoAlpha: 0,
            y: 18
          });
          gsap.set(".js-divider-line", { scaleX: 0, transformOrigin: "0% 50%" });
          gsap.set(".js-flow-meter", { scaleY: 0, transformOrigin: "50% 0%" });
          gsap.set(".js-flow-glow", { autoAlpha: 0.4, scale: 0.92, y: FLOW_GLOW_INITIAL_Y });

          const heroTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });

          heroTimeline
            .to(".js-hero-nav", { autoAlpha: 1, y: 0, duration: 0.5 })
            .to(".js-hero-kicker", { autoAlpha: 1, y: 0, duration: 0.42 }, "<0.12")
            .to(
              ".js-hero-title-line",
              { autoAlpha: 1, y: 0, duration: 0.58, stagger: 0.1 },
              "<0.08"
            )
            .to(".js-hero-sub", { autoAlpha: 1, y: 0, duration: 0.5 }, "<0.18")
            .to(".js-hero-proof", { autoAlpha: 1, y: 0, duration: 0.42 }, "<0.14")
            .to(".js-hero-actions", { autoAlpha: 1, y: 0, duration: 0.45 }, "<0.2")
            .to(".js-hero-footnote", { autoAlpha: 1, y: 0, duration: 0.36 }, "<0.16")
            .to(".js-hero-panel", { autoAlpha: 1, y: 0, duration: 0.65 }, "<0.28")
            .to(
              ".js-terminal-line",
              { autoAlpha: 1, y: 0, duration: 0.34, stagger: { each: 0.08 } },
              "<0.2"
            )
            .to(
              ".js-hero-kpi",
              { autoAlpha: 1, y: 0, duration: 0.28, stagger: 0.06 },
              "<0.06"
            );

          ScrollTrigger.batch(".js-reveal", {
            start: "top 82%",
            once: true,
            onEnter: (items) => {
              gsap.fromTo(
                items,
                { y: 34, autoAlpha: 0 },
                {
                  y: 0,
                  autoAlpha: 1,
                  duration: 0.7,
                  ease: "power2.out",
                  stagger: { each: 0.12, from: "start" },
                  overwrite: "auto"
                }
              );
            }
          });

          gsap.from(".js-reveal-left", {
            x: REVEAL_LEFT_OFFSET,
            autoAlpha: 0,
            duration: 0.7,
            ease: "power2.out",
            stagger: { each: 0.1 },
            scrollTrigger: {
              trigger: "#why",
              start: "top 74%",
              once: true,
              toggleActions: "play none none none"
            }
          });

          gsap.from(".js-reveal-scale", {
            scale: 0.92,
            autoAlpha: 0,
            duration: 0.6,
            ease: "power2.out",
            stagger: { each: 0.08 },
            scrollTrigger: {
              trigger: "#features",
              start: "top 72%",
              once: true,
              toggleActions: "play none none none"
            }
          });

          gsap.utils.toArray(".js-divider-line").forEach((line) => {
            gsap.to(line, {
              scaleX: 1,
              duration: 0.85,
              ease: "power2.out",
              scrollTrigger: {
                trigger: line,
                start: "top 88%",
                toggleActions: "play none none reverse"
              }
            });
          });

          const flowStages = gsap.utils.toArray(".js-flow-stage");

          if (flowStages.length > 0) {
            gsap.set(flowStages, { autoAlpha: 0.2, y: 34, scale: 0.95 });

            const setActiveStage = (activeIndex) => {
              flowStages.forEach((stage, index) => {
                const isActive = index === activeIndex;
                stage.classList.toggle("is-active", isActive);

                gsap.to(stage, {
                  autoAlpha: isActive ? 1 : FLOW_INACTIVE_OPACITY,
                  y: isActive ? FLOW_ACTIVE_Y : 0,
                  scale: isActive ? FLOW_ACTIVE_SCALE : FLOW_INACTIVE_SCALE,
                  duration: isActive ? FLOW_ACTIVE_DURATION : FLOW_INACTIVE_DURATION,
                  ease: isActive ? "power3.out" : "power2.out",
                  overwrite: "auto"
                });
              });

              gsap.to(".js-flow-glow", {
                autoAlpha: FLOW_GLOW_BASE_OPACITY + activeIndex * FLOW_GLOW_OPACITY_STEP,
                y: FLOW_GLOW_BASE_Y + activeIndex * FLOW_GLOW_Y_STEP,
                scale: FLOW_GLOW_BASE_SCALE + activeIndex * FLOW_GLOW_SCALE_STEP,
                duration: 0.45,
                ease: "power2.out",
                overwrite: "auto"
              });
            };

            gsap.fromTo(
              flowStages,
              { autoAlpha: 0, y: 40, scale: 0.93 },
              {
                autoAlpha: 0.7,
                y: 0,
                scale: 0.985,
                duration: 0.72,
                ease: "power3.out",
                stagger: { each: 0.13, from: "start" },
                overwrite: "auto",
                scrollTrigger: {
                  trigger: "#flow",
                  start: "top 80%",
                  once: true,
                  toggleActions: "play none none none"
                }
              }
            );

            flowStages.forEach((stage, index) => {
              gsap.to(stage, {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.64,
                ease: "power2.out",
                overwrite: "auto",
                scrollTrigger: {
                  trigger: stage,
                  start: "top 84%",
                  toggleActions: "play none none reverse"
                }
              });

              ScrollTrigger.create({
                trigger: stage,
                start: "top 64%",
                end: "bottom 46%",
                onEnter: () => setActiveStage(index),
                onEnterBack: () => setActiveStage(index)
              });
            });

            setActiveStage(0);

            ScrollTrigger.create({
              trigger: "#flow",
              start: "top 74%",
              end: "bottom 32%",
              onLeave: () => setActiveStage(flowStages.length - 1),
              onLeaveBack: () => setActiveStage(0)
            });

            gsap.to(".js-flow-meter", {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: "#flow",
                start: "top 76%",
                end: "bottom 30%",
                scrub: 0.35
              }
            });

            gsap.to(".js-flow-meter", {
              filter: "saturate(1.35)",
              scrollTrigger: {
                trigger: "#flow",
                start: "top 76%",
                end: "bottom 30%",
                scrub: 0.35
              }
            });
          }

          if (desktop) {
            gsap.to(".js-hero-panel", {
              yPercent: HERO_PARALLAX_PERCENT,
              ease: "none",
              scrollTrigger: {
                trigger: ".hero",
                start: "top top",
                end: "bottom top",
                scrub: 0.7
              }
            });
          }

          const progressTrigger = rootRef.current || document.documentElement;

          gsap.to(".scroll-indicator-bar", {
            scaleX: 1,
            ease: "none",
            transformOrigin: "0% 50%",
            scrollTrigger: {
              trigger: progressTrigger,
              start: "top top",
              end: "max",
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
