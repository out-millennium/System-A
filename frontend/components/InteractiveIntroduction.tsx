"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { INTRO_TRANSLATIONS } from "@/lib/introTranslations";

type Props = {
  active: boolean;
  replayToken: number;
  onDone: () => void;
};

type SoundKind = "appear" | "record" | "move" | "resolve";

export default function InteractiveIntroduction({ active, replayToken, onDone }: Props) {
  const { locale } = useI18n();
  const c = INTRO_TRANSLATIONS[locale];
  const scrollRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Array<HTMLElement | null>>([]);
  const [scene, setScene] = useState(0);
  const [created, setCreated] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [coreAsked, setCoreAsked] = useState(false);
  const [meaning, setMeaning] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<number | null>(null);
  const [sound, setSound] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  function tone(kind: SoundKind) {
    if (!sound || typeof window === "undefined") return;
    try {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = audioRef.current ?? new AudioCtor();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const settings: Record<SoundKind, [number, number]> = {
        appear: [220, 0.16],
        record: [440, 0.22],
        move: [300, 0.18],
        resolve: [660, 0.34],
      };
      const [frequency, duration] = settings[kind];
      osc.type = kind === "move" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch {
      // Sound is enhancement only; never block the experiment.
    }
  }

  useEffect(() => {
    if (!active) return;
    setScene(0); setCreated(false); setTransferred(false); setCoreAsked(false); setMeaning(null); setChallenge(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    tone("appear");
    return () => { document.body.style.overflow = previous; };
    // replayToken intentionally restarts the same state machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, replayToken]);

  useEffect(() => {
    if (!active || !scrollRef.current) return;
    const root = scrollRef.current;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setScene(Number((visible.target as HTMLElement).dataset.scene ?? 0));
    }, { root, threshold: [0.4, 0.65, 0.85] });
    sceneRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [active]);

  function go(index: number) {
    sceneRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    tone("appear");
  }

  if (!active) return null;

  const sceneClass = "relative flex min-h-[100svh] snap-start items-center px-6 py-24 md:px-12";
  const panelClass = "mx-auto w-full max-w-5xl";

  return (
    <motion.div
      className="sa-intro-root fixed inset-0 z-[120] bg-[var(--sa-base)] text-[var(--sa-text)]"
      initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="sa-intro-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="sa-intro-scan pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(205,214,224,.08),transparent_48%)]" />
      <div className="absolute left-6 top-6 z-20 flex items-center gap-3 md:left-10">
        <span className="sa-mark h-6 w-6"><img src="/system-a-mark.png" alt="" /></span>
        <span className="sa-mono text-[0.65rem] tracking-[0.24em] text-[var(--sa-text-tertiary)]">{c.experiment}</span>
      </div>
      <div className="absolute right-6 top-6 z-20 flex items-center gap-3 md:right-10">
        <span className="sa-mono text-[0.6rem] text-[var(--sa-text-quaternary)]">{String(scene + 1).padStart(2, "0")} / 09</span>
        <button type="button" onClick={() => { setSound((value) => !value); tone("appear"); }} className="sa-navlink text-xs" aria-label={sound ? c.soundOn : c.soundOff}>{sound ? c.soundOn : c.soundOff}</button>
        <LanguageSwitcher />
      </div>
      <div ref={scrollRef} className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth">
        <section ref={(el) => { sceneRefs.current[0] = el; }} data-scene="0" className={`${sceneClass} sa-intro-scene`}>
          <div className={`${panelClass} text-center`}>
            <p className="sa-eyebrow sa-intro-label-loop mb-8">{c.scenes[0].eyebrow}</p>
            <h1 className="sa-display sa-intro-text-loop whitespace-pre-line text-[clamp(2.6rem,8vw,7rem)]">{c.scenes[0].title}</h1>
            <p className="mt-14 text-[clamp(1.35rem,3vw,2.7rem)] text-[var(--sa-text-secondary)]">{c.scenes[0].body}</p>
            <button type="button" onClick={() => go(1)} className="sa-btn sa-btn-ghost mt-14">{c.scenes[0].next}</button>
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[1] = el; }} data-scene="1" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[1].eyebrow}</p>
            <h2 className="sa-heading sa-intro-text-loop max-w-3xl text-[clamp(2.4rem,6vw,6rem)]">{c.scenes[1].title}</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="sa-panel p-7"><p className="sa-eyebrow">CORE RECORD</p><p className="sa-mono mt-5 text-6xl">{created ? "100 A" : "0 A"}</p><p className="mt-4 text-sm text-[var(--sa-text-tertiary)]">{created ? c.created : "account_001 · empty state"}</p></div>
              <button type="button" onClick={() => { setCreated(true); tone("record"); }} disabled={created} className="sa-btn sa-btn-primary">{created ? c.created : c.create}</button>
            </div>
            <p className="mt-8 max-w-xl text-sm text-[var(--sa-text-tertiary)]">{c.demo}</p>
            {created && <button type="button" onClick={() => go(2)} className="sa-btn sa-btn-ghost mt-8">{c.next}</button>}
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[2] = el; }} data-scene="2" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[2].eyebrow}</p>
            <h2 className="sa-heading sa-intro-text-loop max-w-3xl text-[clamp(2.3rem,6vw,6rem)]">{c.scenes[2].title}</h2>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {[["ACCOUNT A", transferred ? "70 A" : created ? "100 A" : "0 A"], ["ACCOUNT B", transferred ? "30 A" : "0 A"]].map(([account, value]) => <div key={account} className="sa-panel p-6"><p className="sa-eyebrow">{account}</p><p className="sa-mono mt-6 text-5xl">{value}</p></div>)}
            </div>
            <div className="mt-8 flex flex-wrap gap-3"><button type="button" disabled={!created || transferred} onClick={() => { setTransferred(true); tone("move"); }} className="sa-btn sa-btn-primary">{transferred ? c.transferred : c.transfer}</button>{transferred && <button type="button" onClick={() => go(3)} className="sa-btn sa-btn-ghost">{c.next}</button>}</div>
            <p className="mt-8 max-w-xl text-sm text-[var(--sa-text-tertiary)]">{c.scenes[2].body}</p>
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[3] = el; }} data-scene="3" className={`${sceneClass} sa-intro-scene`}>
          <div className={`${panelClass} text-center`}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[3].eyebrow}</p>
            <h2 className="sa-heading sa-intro-text-loop text-[clamp(2.5rem,7vw,7rem)]">{c.scenes[3].title}</h2>
            <button type="button" disabled={!transferred} onClick={() => { setCoreAsked(true); tone("resolve"); }} className="sa-btn sa-btn-primary mt-12">{c.askCore}</button>
            {coreAsked && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-12 max-w-3xl border-y border-[var(--sa-line-strong)] py-10"><p className="sa-mono text-2xl leading-relaxed text-[var(--sa-text)]">{c.coreAnswer}</p><button type="button" onClick={() => go(4)} className="sa-btn sa-btn-ghost mt-8">{c.next}</button></motion.div>}
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[4] = el; }} data-scene="4" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[4].eyebrow}</p>
            <h2 className="sa-heading sa-intro-text-loop text-center text-[clamp(2.2rem,6vw,6rem)]">{c.scenes[4].title}</h2>
            <div className="mt-12 grid gap-px overflow-hidden rounded-[var(--sa-r-lg)] border border-[var(--sa-line)] bg-[var(--sa-line-faint)] md:grid-cols-2">
              {[{ label: c.coreNeutral, body: `${c.coreQuantity} · ${c.coreOrder} · ${c.coreRecord}` }, { label: c.externalApplication, body: `${c.externalValue} · ${c.externalPrice} · ${c.externalPurpose} · ${c.externalMeaning}` }].map((item) => <button type="button" key={item.label} onClick={() => tone("appear")} className="sa-glass-panel p-8 text-left transition-colors hover:bg-[var(--sa-surface-2)]"><p className="sa-eyebrow">{item.label}</p><p className="sa-mono mt-6 text-lg text-[var(--sa-text-secondary)]">{item.body}</p></button>)}
            </div>
            <p className="mx-auto mt-10 max-w-xl text-center text-sm text-[var(--sa-text-tertiary)]">{c.coreNotPrice}</p><button type="button" onClick={() => go(5)} className="sa-btn sa-btn-ghost mx-auto mt-8 block">{c.next}</button>
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[5] = el; }} data-scene="5" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[5].eyebrow}</p>
            <h2 className="sa-heading text-[clamp(2.3rem,6vw,6rem)]">{c.scenes[5].title}</h2>
            <div className="mt-12 grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]"><div className="sa-panel p-7"><p className="sa-eyebrow">{c.coreNeutral}</p><p className="sa-mono mt-5 text-xl">neutral records</p></div><span className="sa-mono text-[var(--sa-accent)]">SERVER-TO-SERVER</span><div className="sa-panel p-7"><p className="sa-eyebrow">{c.externalApplication}</p><p className="sa-mono mt-5 text-xl">GRM · quote · model</p></div></div>
            <p className="mt-10 max-w-2xl text-lg text-[var(--sa-text-secondary)]">{c.meridianReads}</p><p className="mt-3 text-sm text-[var(--sa-text-tertiary)]">{c.meridianExternal}</p><button type="button" onClick={() => go(6)} className="sa-btn sa-btn-ghost mt-10">{c.next}</button>
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[6] = el; }} data-scene="6" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}>
            <p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[6].eyebrow}</p><h2 className="sa-heading sa-intro-text-loop text-[clamp(2.5rem,7vw,7rem)]">{c.chooseMeaning}</h2><p className="mt-5 max-w-xl text-sm text-[var(--sa-text-tertiary)]">{c.compare}</p>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{c.meanings.map((item) => <button key={item} type="button" onClick={() => { setMeaning(item); tone("record"); }} className={`sa-btn min-h-16 whitespace-normal text-center ${meaning === item ? "sa-btn-primary" : "sa-btn-ghost"}`}>{item}</button>)}</div>
            {meaning && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 grid gap-3 md:grid-cols-2"><div className="sa-panel p-6"><p className="sa-eyebrow">YOUR INTERPRETATION</p><p className="mt-4 text-2xl">{meaning}</p></div><div className="sa-panel p-6"><p className="sa-eyebrow">{c.coreKnows}</p><p className="sa-mono mt-4 text-lg">{c.coreQuantity} · {c.coreOrder} · {c.coreRecord}</p><p className="mt-3 text-sm text-[var(--sa-text-tertiary)]">{c.coreDoesNotKnow}: {c.externalValue}, {c.externalPrice}, {c.externalPurpose}, {c.externalMeaning}</p></div></motion.div>}
            {meaning && <button type="button" onClick={() => go(7)} className="sa-btn sa-btn-ghost mt-8">{c.next}</button>}
          </div>
        </section>

        <section ref={(el) => { sceneRefs.current[7] = el; }} data-scene="7" className={`${sceneClass} sa-intro-scene`}>
          <div className={panelClass}><p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[7].eyebrow}</p><h2 className="sa-heading text-[clamp(2.3rem,6vw,6rem)]">{c.challengeTitle}</h2><p className="mt-5 max-w-2xl text-lg text-[var(--sa-text-secondary)]">{c.challengeLead}</p><div className="mt-10 space-y-2">{c.challengeQuestions.map((question, index) => <div key={question} className="border-b border-[var(--sa-line)]"><button type="button" onClick={() => { setChallenge(challenge === index ? null : index); tone("appear"); }} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm text-[var(--sa-text)]"><span>{question}</span><span className="sa-mono text-[var(--sa-text-quaternary)]">{challenge === index ? "−" : "+"}</span></button><AnimatePresence>{challenge === index && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pb-5 text-sm leading-7 text-[var(--sa-text-secondary)]">{c.challengeAnswers[index]}</motion.p>}</AnimatePresence></div>)}</div><div className="mt-10 flex flex-wrap gap-3"><button type="button" onClick={() => go(8)} className="sa-btn sa-btn-ghost">{c.next}</button><a href="/documents" className="sa-btn sa-btn-ghost">{c.declarations}</a></div></div>
        </section>

        <section ref={(el) => { sceneRefs.current[8] = el; }} data-scene="8" className={`${sceneClass} sa-intro-scene`}>
          <div className={`${panelClass} text-center`}><p className="sa-eyebrow sa-intro-label-loop mb-6">{c.scenes[8].eyebrow}</p><h2 className="sa-heading sa-intro-text-loop text-[clamp(2.5rem,7vw,7rem)]">{c.finalTitle}</h2><p className="mx-auto mt-8 max-w-2xl text-xl text-[var(--sa-text-secondary)]">{c.finalBody}</p><div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={onDone} className="sa-btn sa-btn-primary">{c.finish}</button><button type="button" onClick={onDone} className="sa-btn sa-btn-ghost">{c.replay}</button></div></div>
        </section>
      </div>
      <button type="button" onClick={onDone} className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-xs text-[var(--sa-text-quaternary)] underline-offset-4 hover:text-[var(--sa-text-secondary)] hover:underline">{c.skip}</button>
    </motion.div>
  );
}
