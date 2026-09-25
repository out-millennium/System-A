"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FirstVisitLanguage from "@/components/FirstVisitLanguage";
import SoundToggle from "@/components/SoundToggle";
import type { TextRect } from "@/components/SceneCanvas";
import { useT } from "@/lib/i18n";
import SystemAMark from "@/components/SystemAMark";

/* WebGL layer is client-only. */
const SceneCanvas = dynamic(() => import("@/components/SceneCanvas"), {
  ssr: false,
});

/* Entrance gate for the sign-out → landing hand-off (?welcome=1). */
const IntroContext = createContext<boolean>(true);
function useEntranceReady() {
  return useContext(IntroContext);
}

/* Shared refs so the 3D field can read smoothed scroll + the text rects. */
const FieldContext = createContext<{
  scrollRef: React.MutableRefObject<number>;
  textRectsRef: React.MutableRefObject<TextRect[]>;
  register: (el: HTMLElement | null) => void;
} | null>(null);

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/* Reveal wrapper that also registers its box for the field to react to. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const field = useContext(FieldContext);
  return (
    <motion.div
      ref={(el) => field?.register(el)}
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: false, margin: "-12% 0px" }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
   Landing
   ------------------------------------------------------------------------ */
export default function LandingPage({
  visitorFirstVisit = null,
}: {
  // null = server gate could not be evaluated; FirstVisitLanguage falls back to
  // the existing localStorage/cookie marker in that case.
  visitorFirstVisit?: boolean | null;
}) {
  return (
    <Suspense fallback={<LandingContent forceWelcome={false} visitorFirstVisit={visitorFirstVisit} />}>
      <LandingWithParams visitorFirstVisit={visitorFirstVisit} />
    </Suspense>
  );
}

function LandingWithParams({ visitorFirstVisit }: { visitorFirstVisit?: boolean | null }) {
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "1";
  return <LandingContent forceWelcome={isWelcome} visitorFirstVisit={visitorFirstVisit} />;
}

function LandingContent({
  forceWelcome,
  visitorFirstVisit,
}: {
  forceWelcome: boolean;
  visitorFirstVisit?: boolean | null;
}) {
  const isWelcome = forceWelcome;

  const [revealing, setRevealing] = useState(isWelcome);
  const [entranceReady, setEntranceReady] = useState(!isWelcome);
  const [introActive, setIntroActive] = useState(isWelcome);
  const [filterCleared, setFilterCleared] = useState(!isWelcome);
  // The language dialog waits for the initial viewport entrance, not for a
  // guessed timeout. Scroll-triggered reveals later on the page are separate
  // content animation and must not block the first-visit choice.
  const [navEntranceComplete, setNavEntranceComplete] = useState(false);
  const [heroEntranceComplete, setHeroEntranceComplete] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const failSafe = window.setTimeout(
      () => {
        // Framer Motion normally calls both completion callbacks. This only
        // prevents a browser-specific animation event failure from hiding the
        // language choice forever.
        setNavEntranceComplete(true);
        setHeroEntranceComplete(true);
      },
      reduce ? 0 : isWelcome ? 3000 : 2600
    );
    return () => window.clearTimeout(failSafe);
  }, [isWelcome, reduce]);

  const initialAnimationsComplete = navEntranceComplete && heroEntranceComplete;

  useEffect(() => {
    if (!isWelcome) return;
    const t0 = window.setTimeout(() => setRevealing(false), 20);
    const t1 = window.setTimeout(() => {
      setEntranceReady(true);
    }, 340);
    const t2 = window.setTimeout(() => {
      setFilterCleared(true);
      setIntroActive(false);
    }, 1650);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isWelcome]);

  const wrapperStyle: React.CSSProperties | undefined = isWelcome
    ? {
        filter: revealing ? "blur(10px)" : "blur(0px)",
        transition: "filter 0.3s linear",
      }
    : undefined;

  /* --- Smoothed scroll + text-rect reporting for the field ----------------- */
  const scrollRef = useRef(0); // smoothed 0..1
  const textRectsRef = useRef<TextRect[]>([]);
  const targetsRef = useRef<Set<HTMLElement>>(new Set());
  const rawScroll = useRef(0);

  const register = useRef((el: HTMLElement | null) => {
    // returned cleanup handled by re-registration each render; we keep a set
    if (el) targetsRef.current.add(el);
  }).current;

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      rawScroll.current = max > 0 ? window.scrollY / max : 0;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const tick = () => {
      // smooth (damped) scroll so wheel jumps interpolate fluidly
      scrollRef.current += (rawScroll.current - scrollRef.current) * 0.08;

      // recompute visible text rects in NDC (x,y in [-1,1], w,h half-extents)
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rects: TextRect[] = [];
      targetsRef.current.forEach((el) => {
        if (!el.isConnected) {
          targetsRef.current.delete(el);
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh + 50) return; // offscreen
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        rects.push({
          x: (cx / vw) * 2 - 1,
          y: -((cy / vh) * 2 - 1),
          w: (r.width / vw),
          h: (r.height / vh),
        });
      });
      textRectsRef.current = rects;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <IntroContext.Provider value={entranceReady}>
      <FieldContext.Provider value={{ scrollRef, textRectsRef, register }}>
        {/* Haptics + ambient/hover sound are mounted once in the root layout
            (PublicChrome) so they work on every public page, not only here. */}
        {/* Always-on cinematic 3D field, fixed behind everything */}
        <div
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
          aria-hidden="true"
        >
          <SceneCanvas scrollRef={scrollRef} textRectsRef={textRectsRef} />
          {/* faint drifting darkening so the field stays calm, never flat */}
          <div className="sa-field-veil" />
        </div>

        <div
          className="relative z-10 min-h-screen"
          style={filterCleared ? undefined : wrapperStyle}
        >
          <Nav onInitialAnimationComplete={() => setNavEntranceComplete(true)} />
          <Hero onInitialAnimationComplete={() => setHeroEntranceComplete(true)} />
          <Principles />
          <Architecture />
          <Determinism />
          <Declarations />
          <RecognizedApps />
          <ClosingCTA />
          <Footer />
        </div>

        {/* First-visit language reveal (shown once, after the initial viewport
            entrance animations complete and the server IP gate allows it). */}
        <FirstVisitLanguage
          serverFirstVisit={visitorFirstVisit}
          initialAnimationsComplete={initialAnimationsComplete}
        />

        {/* Sign-out hand-off title overlay */}
        <AnimatePresence>
          {introActive && (
            <motion.div
              className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-hidden="true"
            >
              <div className="flex flex-col items-center gap-7">
                <motion.span
                  className="sa-wordmark sa-wordmark-lg text-[clamp(2.5rem,9vw,7rem)]"
                  initial={{ opacity: 0.5, filter: "blur(0px)" }}
                  animate={{ opacity: [0.5, 1, 1, 0], filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(12px)"] }}
                  transition={{ duration: 1.35, times: [0, 0.18, 0.64, 1], ease: "linear" }}
                >
                  SYSTEM&nbsp;A
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, scale: 0.7, filter: "blur(16px)" }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 1.15], filter: ["blur(16px)", "blur(0px)", "blur(0px)", "blur(14px)"] }}
                  transition={{ duration: 1.15, delay: 0.42, times: [0, 0.28, 0.7, 1], ease: "easeInOut" }}
                >
                  <SystemAMark className="sa-mark-lg" />
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FieldContext.Provider>
    </IntroContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
   Navigation
   ------------------------------------------------------------------------ */
function Nav({
  onInitialAnimationComplete,
}: {
  onInitialAnimationComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ready = useEntranceReady();
  const reduce = useReducedMotion();
  const t = useT();

  return (
    <motion.nav
      className="sa-nav"
      initial={{ y: -24, opacity: 0 }}
      animate={ready ? { y: 0, opacity: 1 } : { y: -24, opacity: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
      onAnimationComplete={() => {
        if (ready) onInitialAnimationComplete?.();
      }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2" aria-label="SYSTEM A">
          <SystemAMark className="h-7 w-7" />
          <span className="sa-wordmark text-base md:text-lg">SYSTEM&nbsp;A</span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          <NavLink href="/about">{t("nav.about")}</NavLink>
          <NavLink href="/architecture">{t("nav.architecture")}</NavLink>
          <NavLink href="/transparency">{t("nav.transparency")}</NavLink>
          <NavLink href="/api-docs">{t("nav.api")}</NavLink>
          <NavLink href="/documents">{t("nav.documents")}</NavLink>
        </div>

        <div className="flex items-center gap-3">
          <SoundToggle />
          <LanguageSwitcher />
          <Link
            href="/login"
            className="sa-navlink hidden px-2 py-1 sm:inline-block"
          >
            {t("nav.signIn")}
          </Link>
          <Link href="/register" className="sa-btn sa-btn-primary !py-2 !px-4">
            {t("nav.getAccess")}
          </Link>
          <button
            type="button"
            className="sa-pressable text-[var(--sa-text-secondary)] lg:hidden"
            aria-label={t("nav.menu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <motion.path
                initial={{ d: "M3 6h14M3 14h14" }}
                animate={{ d: open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 14h14" }}
                transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="mobile-nav"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
            className="overflow-hidden border-t border-[var(--sa-line-faint)] px-6 py-4 lg:hidden"
          >
            <div className="flex flex-col gap-4">
              <NavLink href="/about">{t("nav.about")}</NavLink>
              <NavLink href="/architecture">{t("nav.architecture")}</NavLink>
              <NavLink href="/transparency">{t("nav.transparency")}</NavLink>
              <NavLink href="/api-docs">{t("nav.api")}</NavLink>
              <NavLink href="/documents">{t("nav.documents")}</NavLink>
              <NavLink href="/login">{t("nav.signIn")}</NavLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="sa-navlink">
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------------ */
function Hero({
  onInitialAnimationComplete,
}: {
  onInitialAnimationComplete?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const ready = useEntranceReady();
  const t = useT();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Keep the hero fully visible while its content (incl. the chips at the
  // bottom) is still on screen; only start the parallax fade once the user is
  // genuinely scrolling away. The fade/shift now happen over the second half
  // of the section's scroll progress instead of from the very top.
  const y = useTransform(scrollYProgress, [0.5, 1], [0, reduce ? 0 : 90]);
  const opacity = useTransform(scrollYProgress, [0.55, 0.95], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-6 pt-28 md:px-10"
    >
      <motion.div style={{ y, opacity }} className="mx-auto w-full max-w-[1400px]">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={ready ? "show" : "hidden"}
          className="sa-repel max-w-4xl"
        >
          <motion.p variants={fadeUp} className="sa-eyebrow mb-8">
            {t("landing.hero.eyebrow")}
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="sa-display sa-text-gradient text-[clamp(2.75rem,8vw,7.5rem)]"
          >
            {t("landing.hero.titleTop")}
            <br />{" "}
            <span className="text-[var(--sa-text-tertiary)]">
              {t("landing.hero.titleBottom")}
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="sa-lead mt-10 max-w-xl text-base md:text-lg"
          >
            {t("landing.hero.lead")}
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-12 flex flex-col gap-3 sm:flex-row"
          >
            <Link href="/register" className="sa-btn sa-btn-primary">
              {t("landing.hero.createAccount")}
            </Link>
            <Link href="/architecture" className="sa-btn sa-btn-ghost">
              {t("landing.hero.exploreArchitecture")}
            </Link>
            <Link href="/become-admin" className="sa-btn sa-btn-ghost">
              {t("admin.becomeAdmin")}
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={ready ? "show" : "hidden"}
          transition={{ delay: 0.5 }}
          className="sa-repel mt-24 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-6 border-t border-[var(--sa-line)] pt-8 sm:grid-cols-3"
        >
          {[
            [t("landing.hero.chip1Title"), t("landing.hero.chip1Sub")],
            [t("landing.hero.chip2Title"), t("landing.hero.chip2Sub")],
            [t("landing.hero.chip3Title"), t("landing.hero.chip3Sub")],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-sm font-medium text-[var(--sa-text)]">{k}</p>
              <p className="mt-1 text-xs text-[var(--sa-text-tertiary)]">{v}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: ready ? 1.2 : 0, duration: reduce ? 0 : 1 }}
        onAnimationComplete={() => {
          if (ready) onInitialAnimationComplete?.();
        }}
      >
        <div className="flex flex-col items-center gap-2 text-[var(--sa-text-quaternary)]">
          <span className="text-[0.625rem] tracking-[0.3em] uppercase">
            {t("landing.hero.scroll")}
          </span>
          <span className="h-8 w-px bg-gradient-to-b from-[var(--sa-text-quaternary)] to-transparent" />
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Principles
   ------------------------------------------------------------------------ */
function Principles() {
  const t = useT();
  const items = [
    { no: "01", title: t("landing.principles.p1Title"), desc: t("landing.principles.p1Desc") },
    { no: "02", title: t("landing.principles.p2Title"), desc: t("landing.principles.p2Desc") },
    { no: "03", title: t("landing.principles.p3Title"), desc: t("landing.principles.p3Desc") },
  ];

  return (
    <section className="relative px-6 py-32 md:px-10 md:py-48">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal className="sa-repel">
            <p className="sa-eyebrow mb-6">{t("landing.principles.eyebrow")}</p>
            <h2 className="sa-heading text-[clamp(2rem,4vw,3.5rem)]">
              {t("landing.principles.title")}
            </h2>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: false, margin: "-10% 0px" }}
            className="flex flex-col"
          >
            {items.map((it) => (
              <motion.div
                key={it.no}
                variants={fadeUp}
                className="sa-repel group grid grid-cols-[auto_1fr] gap-6 border-t border-[var(--sa-line)] py-8 first:border-t-0"
              >
                <span className="sa-mono text-sm text-[var(--sa-text-quaternary)]">
                  {it.no}
                </span>
                <div>
                  <h3 className="sa-heading text-xl md:text-2xl">{it.title}</h3>
                  <p className="sa-lead mt-3 max-w-xl text-sm md:text-base">
                    {it.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Architecture
   ------------------------------------------------------------------------ */
function Architecture() {
  const t = useT();
  const layers = [
    { name: "Core", role: t("landing.architecture.coreRole"), desc: t("landing.architecture.coreDesc") },
    { name: t("landing.architecture.grmName"), role: t("landing.architecture.grmRole"), desc: t("landing.architecture.grmDesc") },
    { name: "Frontend", role: t("landing.architecture.frontendRole"), desc: t("landing.architecture.frontendDesc") },
    { name: "Infrastructure", role: t("landing.architecture.infraRole"), desc: t("landing.architecture.infraDesc") },
  ];

  return (
    <section className="relative overflow-hidden px-6 py-32 md:px-10 md:py-48">
      <div className="mx-auto max-w-[1400px]">
        <Reveal className="sa-repel mb-20 max-w-2xl">
          <p className="sa-eyebrow mb-6">{t("landing.architecture.eyebrow")}</p>
          <h2 className="sa-heading text-[clamp(2rem,4vw,3.5rem)]">
            {t("landing.architecture.title")}
          </h2>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: false, margin: "-8% 0px" }}
          className="grid gap-px overflow-hidden rounded-[var(--sa-r-xl)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] md:grid-cols-2"
        >
          {layers.map((l, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="sa-repel sa-glass-panel sa-interactive relative p-8 md:p-12"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="sa-eyebrow mb-1 !tracking-[0.2em]">{l.role}</p>
                  <h3 className="sa-heading text-2xl md:text-3xl">{l.name}</h3>
                </div>
                <span className="sa-mono text-xs text-[var(--sa-text-quaternary)]">
                  L{i + 1}
                </span>
              </div>
              <p className="sa-lead mt-6 max-w-md text-sm">{l.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Determinism
   ------------------------------------------------------------------------ */
function Determinism() {
  const t = useT();
  return (
    <section className="relative px-6 py-32 md:px-10 md:py-48">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <Reveal className="sa-repel">
            <p className="sa-eyebrow mb-6">{t("landing.determinism.eyebrow")}</p>
            <h2 className="sa-heading text-[clamp(2rem,4.5vw,4rem)]">
              {t("landing.determinism.title")}
            </h2>
            <p className="sa-lead mt-8 max-w-lg">
              {t("landing.determinism.lead")}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="sa-panel sa-repel overflow-hidden p-1.5">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="sa-dot sa-dot-ok sa-dot-live" />
                  <span className="text-xs text-[var(--sa-text-secondary)]">
                    ledger.trace
                  </span>
                </div>
                <span className="sa-mono text-[0.625rem] text-[var(--sa-text-quaternary)]">
                  append-only
                </span>
              </div>
              <div className="sa-surface !rounded-[18px] p-5">
                <pre className="sa-mono overflow-x-auto text-xs leading-relaxed text-[var(--sa-text-secondary)]">
{`POST /transfer
content-type: application/json
x-admin-key: •••••••••
{
  "from_account": "node.a",
  "to_account":   "node.b",
  "amount":       128
}

→ 200 OK
{
  "status": "ok"
}`}
                </pre>
              </div>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-b-[20px] bg-[var(--sa-line-faint)]">
                {[
                  [t("landing.determinism.latency"), t("landing.determinism.metaLatency")],
                  [t("landing.determinism.ordering"), t("landing.determinism.metaOrdering")],
                  [t("landing.determinism.replay"), t("landing.determinism.metaReplay")],
                ].map(([k, v]) => (
                  <div key={k} className="bg-[var(--sa-surface-0)] p-4">
                    <p className="text-[0.625rem] uppercase tracking-wide text-[var(--sa-text-quaternary)]">
                      {k}
                    </p>
                    <p className="mt-1 text-xs text-[var(--sa-text-secondary)]">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Declarations
   ------------------------------------------------------------------------ */
// Each declaration links to its OWN source file on GitHub (mirrors the mapping
// used by /documents), instead of all cards pointing at the same docs folder.
const DECLARATION_FILES = [
  "01_non_asset_declaration.md",
  "02_system_a_specification.md",
  "03_creator_status_and_limitations.md",
  "04_external_app_recognition_policy.md",
  "05_external_application_policy.md",
  "06_procedural_neutrality_and_disclaimer.md",
  "07_user_status_no_rights.md",
  "08_records_and_history_status.md",
  "09_no_liability_for_hostile_interpretations.md",
  "10_no_economic_or_regulatory_function.md",
] as const;

function Declarations() {
  const t = useT();
  const docs = [
    t("declarationTitles.d01"),
    t("declarationTitles.d02"),
    t("declarationTitles.d03"),
    t("declarationTitles.d04"),
    t("declarationTitles.d05"),
    t("declarationTitles.d06"),
    t("declarationTitles.d07"),
    t("declarationTitles.d08"),
    t("declarationTitles.d09"),
    t("declarationTitles.d10"),
  ];

  return (
    <section className="relative px-6 py-32 md:px-10 md:py-48">
      <div className="mx-auto max-w-[1400px]">
        <Reveal className="sa-repel mb-16 max-w-2xl">
          <p className="sa-eyebrow mb-6">{t("landing.declarations.eyebrow")}</p>
          <h2 className="sa-heading text-[clamp(2rem,4vw,3.5rem)]">
            {t("landing.declarations.title")}
          </h2>
          <p className="sa-lead mt-6 max-w-xl">
            {t("landing.declarations.lead")}
          </p>
        </Reveal>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: false, margin: "-6% 0px" }}
          className="grid gap-px overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] sm:grid-cols-2"
        >
          {docs.map((d, i) => (
            <motion.a
              key={i}
              variants={fadeUp}
              href={`https://github.com/out-millennium/system-a-core/blob/main/docs/${DECLARATION_FILES[i]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sa-repel sa-glass-panel sa-interactive group flex items-center gap-5 px-6 py-5"
            >
              {/* pointer-events-none on children makes the whole card ONE hit
                  target: moving between the number / label / arrow no longer
                  re-fires hover, so a card has a single tap spot (no doubles). */}
              <span className="pointer-events-none sa-mono text-xs text-[var(--sa-text-quaternary)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="pointer-events-none flex-1 text-sm text-[var(--sa-text-secondary)] transition-colors group-hover:text-[var(--sa-text)]">
                {d}
              </span>
              <span className="pointer-events-none text-[var(--sa-text-quaternary)] transition-transform group-hover:translate-x-1">
                →
              </span>
            </motion.a>
          ))}
        </motion.div>

        <Reveal delay={0.1}>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/documents" className="sa-btn sa-btn-ghost">
              {t("landing.declarations.browseAll")}
            </Link>
            <Link href="/transparency" className="sa-btn sa-btn-ghost">
              {t("landing.declarations.transparencyModel")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Recognized external applications (Declaration 04)

   This section is the AUTHORITATIVE source of recognition: System A itself names
   Meridian as a recognized external application and links to its official URL.
   Because it lives on the genuine System A site, a user can start here to reach
   the real Meridian (a phishing clone cannot make this page point at itself).
   The anchor id `recognized-applications` lets Meridian deep-link back to it.
   The official Meridian URL is configurable via NEXT_PUBLIC_MERIDIAN_URL.
   ------------------------------------------------------------------------ */
function RecognizedApps() {
  const t = useT();
  const meridianUrl =
    process.env.NEXT_PUBLIC_MERIDIAN_URL || "https://meridian.example";
  return (
    <section
      id="recognized-applications"
      className="relative scroll-mt-24 px-6 py-32 md:px-10 md:py-48"
    >
      <div className="mx-auto max-w-[900px]">
        <Reveal>
          <p className="sa-eyebrow mb-6">{t("landing.recognized.eyebrow")}</p>
          <h2 className="sa-heading text-[clamp(2rem,4.5vw,4rem)]">
            {t("landing.recognized.title")}
          </h2>
          <p className="sa-lead mt-8 max-w-2xl">
            {t("landing.recognized.lead")}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="sa-panel sa-repel mt-12 p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="sa-dot sa-dot-ok" />
                <div>
                  <p className="text-sm font-medium text-[var(--sa-text)]">
                    Meridian
                  </p>
                  <p className="text-xs text-[var(--sa-text-secondary)]">
                    {t("landing.recognized.meridianDesc")}
                  </p>
                </div>
              </div>
              <a
                href={meridianUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sa-btn sa-btn-primary"
              >
                {t("landing.recognized.visit")}
              </a>
            </div>
            <p className="sa-mono mt-4 break-all text-xs text-[var(--sa-text-quaternary)]">
              {meridianUrl}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mt-8 max-w-2xl text-xs text-[var(--sa-text-tertiary)]">
            {t("landing.recognized.note")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Closing CTA
   ------------------------------------------------------------------------ */
function ClosingCTA() {
  const t = useT();
  return (
    <section className="relative px-6 py-40 md:px-10 md:py-56">
      <div className="mx-auto max-w-[1000px] text-center">
        <Reveal className="sa-repel">
          <p className="sa-eyebrow mb-8">{t("landing.cta.eyebrow")}</p>
          <h2 className="sa-heading sa-text-gradient text-[clamp(2.5rem,6vw,5.5rem)]">
            {t("landing.cta.titleTop")}
            <br />{" "}
            {t("landing.cta.titleBottom")}
          </h2>
          <p className="sa-lead mx-auto mt-8 max-w-lg">
            {t("landing.cta.lead")}
          </p>
          <div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className="sa-btn sa-btn-primary">
              {t("landing.cta.createAccount")}
            </Link>
            <Link href="/api-docs" className="sa-btn sa-btn-ghost">
              {t("landing.cta.readApi")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Footer
   ------------------------------------------------------------------------ */
function Footer() {
  const t = useT();
  return (
    <footer className="relative border-t border-[var(--sa-line)] px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2" aria-label="SYSTEM A">
          <SystemAMark className="h-6 w-6" />
          <span className="sa-wordmark text-base">SYSTEM&nbsp;A</span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs">
          <Link href="/about" className="sa-navlink">
            {t("nav.about")}
          </Link>
          <Link href="/architecture" className="sa-navlink">
            {t("nav.architecture")}
          </Link>
          <Link href="/transparency" className="sa-navlink">
            {t("nav.transparency")}
          </Link>
          <a
            href="https://github.com/out-millennium/system-a-core"
            target="_blank"
            rel="noopener noreferrer"
            className="sa-navlink"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
