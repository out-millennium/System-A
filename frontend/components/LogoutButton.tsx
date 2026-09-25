"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useModeration } from "@/lib/useModeration";
import SystemAMark from "@/components/SystemAMark";

/* Starfield timelapse video.
   Put your video file here:  frontend/public/starfield.mp4
   (it is then served at "/starfield.mp4").
   Requirements: real footage, sky only, sped-up timelapse, no audio.
   Optionally the path can be overridden via NEXT_PUBLIC_STARFIELD_URL. */
const STARFIELD_SRC =
  process.env.NEXT_PUBLIC_STARFIELD_URL || "/starfield.mp4";

const EASE = [0.22, 1, 0.36, 1] as const;

/* --- Cinematic timeline (seconds) -----------------------------------------
   0.0            screen goes black
   0.0 -> 0.6     video fades in (0% -> 100%)
   0.6 (+1.0s)    hold, then at 1.6 the SYSTEM A title starts appearing
   1.6 -> 2.2     title fades in
   2.2 (+1.0s)    hold both at full
   3.2 -> 3.8     video fades out
   3.5 -> 4.1     title fades out (starts 0.3s after the video begins fading)
   ~3.8           navigate to the landing page; landing fades in + de-blurs
-------------------------------------------------------------------------- */
const V = { videoIn: 0.6, holdVideo: 1.0, titleIn: 0.6, holdBoth: 1.0, titleDelay: 0.3, fade: 0.6 };

// video animation total: in + hold + titleIn + holdBoth + fade
const VIDEO_TOTAL = V.videoIn + V.holdVideo + V.titleIn + V.holdBoth + V.fade; // 3.8s
// title animation total: adds the extra 0.3s fade-out delay at the end
const TITLE_TOTAL = VIDEO_TOTAL + V.titleDelay; // 4.1s

// Hand off to the landing page the moment the video has fully faded out.
const HANDOFF_MS = VIDEO_TOTAL * 1000; // 3800ms

export default function LogoutButton() {
  const t = useT();
  const router = useRouter();
  const { status: moderation } = useModeration();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const runCinematic = useCallback(() => {
    setConfirmOpen(false);
    setPlaying(true);

    // End the session in the background without navigating away yet.
    signOut({ redirect: false }).catch(() => {});

    try {
      videoRef.current?.play?.().catch(() => {});
    } catch {
      /* autoplay may be deferred; the <video autoPlay> handles it */
    }

    // After the video has fully faded out, hand off to the landing page,
    // asking it to fade + de-blur into view for a seamless transition.
    window.setTimeout(() => {
      router.push("/?welcome=1");
    }, HANDOFF_MS);
  }, [router]);

  // A muted user keeps their session (cookies stay) — offer "browse the site"
  // instead of sign-out. Use a hard navigation so the server re-renders "/" as
  // the public landing (it now shows the landing for restricted sessions rather
  // than bouncing back into the dashboard).
  if (moderation?.muted.active && !moderation?.banned.active) {
    return (
      <button
        type="button"
        onClick={() => {
          window.location.href = "/";
        }}
        className="sa-navlink flex items-center gap-2 text-sm"
      >
        {t("moderation.viewSite")}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="sa-navlink flex items-center gap-2 text-sm"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11 14 7.5 10.5 4M14 7.5H6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("dashboard.signOut")}
      </button>

      {/* Confirmation dialog — rounded card window, red (Burn) outline */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "linear" }}
            className="fixed inset-0 z-[80] flex items-center justify-center px-4"
            onClick={() => setConfirmOpen(false)}
          >
            {/* dimmed + blurred backdrop — blur ramps in over 0.2s, no delay */}
            <motion.div
              className="absolute inset-0"
              initial={{
                backgroundColor: "rgba(0,0,0,0)",
                backdropFilter: "blur(0px)",
                WebkitBackdropFilter: "blur(0px)",
              }}
              animate={{
                backgroundColor: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
              exit={{
                backgroundColor: "rgba(0,0,0,0)",
                backdropFilter: "blur(0px)",
                WebkitBackdropFilter: "blur(0px)",
              }}
              transition={{ duration: 0.2, ease: "linear" }}
            />

            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.4, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md rounded-[var(--sa-r-lg)] p-8 text-center"
              style={{
                fontFamily: "var(--font-serif)",
                background:
                  "linear-gradient(180deg, rgba(201,141,141,0.05), rgba(0,0,0,0)), var(--sa-surface-1)",
                border: "1px solid rgba(201,141,141,0.55)",
                boxShadow:
                  "0 0 0 1px rgba(201,141,141,0.12), 0 30px 80px -30px rgba(0,0,0,0.85), 0 0 60px -20px rgba(201,141,141,0.35)",
              }}
            >
              <p
                className="text-xl leading-relaxed"
                style={{
                  fontFamily: "var(--font-serif)",
                  color: "var(--sa-text)",
                }}
              >
                {t("logout.question")}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {/* STAY — white, left */}
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="min-h-[2.75rem] flex-1 whitespace-normal rounded-full px-5 py-2.5 text-center text-sm font-semibold leading-snug transition-transform active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    background: "#f2f4f7",
                    color: "#0a0b0c",
                  }}
                >
                  {t("logout.stay")}
                </button>
                {/* LOG OUT — red, right */}
                <button
                  onClick={runCinematic}
                  className="min-h-[2.75rem] flex-1 whitespace-normal rounded-full px-5 py-2.5 text-center text-sm font-semibold leading-snug transition-transform active:scale-[0.98]"
                  style={{
                    fontFamily: "var(--font-serif)",
                    background: "rgba(201,141,141,0.14)",
                    color: "var(--sa-danger)",
                    border: "1px solid rgba(201,141,141,0.5)",
                  }}
                >
                  {t("logout.logout")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic sign-out overlay */}
      <AnimatePresence>
        {playing && (
          <motion.div
            className="fixed inset-0 z-[100] overflow-hidden bg-black"
            initial={{ opacity: 1 }}
            aria-hidden="true"
          >
            {/* Starfield video: fade in 0->0.6s, hold, fade out 3.2->3.8s */}
            <motion.video
              ref={videoRef}
              src={STARFIELD_SRC}
              muted
              loop
              playsInline
              autoPlay
              preload="auto"
              disablePictureInPicture
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                // Preserve maximum image fidelity while scaling to cover.
                imageRendering: "auto",
                // Avoid any inherited blur/filter tinting the footage.
                filter: "none",
                backfaceVisibility: "hidden",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{
                duration: VIDEO_TOTAL,
                times: [
                  0,
                  V.videoIn / VIDEO_TOTAL,
                  (V.videoIn + V.holdVideo + V.titleIn + V.holdBoth) /
                    VIDEO_TOTAL,
                  1,
                ],
                ease: "linear",
              }}
            />

            {/* SYSTEM A title: in 1.6->2.2, out 3.5->4.1 */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1, 1, 0] }}
              transition={{
                duration: TITLE_TOTAL,
                times: [
                  0,
                  (V.videoIn + V.holdVideo) / TITLE_TOTAL,
                  (V.videoIn + V.holdVideo + V.titleIn) / TITLE_TOTAL,
                  (V.videoIn + V.holdVideo + V.titleIn + V.holdBoth + V.titleDelay) /
                    TITLE_TOTAL,
                  1,
                ],
                ease: "linear",
              }}
            >
              <div className="flex flex-col items-center gap-7">
                <motion.span
                  className="sa-wordmark sa-wordmark-lg text-[clamp(2.5rem,9vw,7rem)]"
                  initial={{ opacity: 0, filter: "blur(0px)" }}
                  animate={{ opacity: [0, 1, 1, 0], filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(12px)"] }}
                  transition={{ duration: TITLE_TOTAL, times: [0, 0.39, 0.78, 1], ease: "linear" }}
                >
                  SYSTEM&nbsp;A
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, scale: 0.72, filter: "blur(16px)" }}
                  animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.72, 0.72, 1, 1, 1.14], filter: ["blur(16px)", "blur(16px)", "blur(0px)", "blur(0px)", "blur(14px)"] }}
                  transition={{ duration: TITLE_TOTAL, times: [0, 0.39, 0.54, 0.8, 1], ease: "linear" }}
                >
                  <SystemAMark className="sa-mark-lg" />
                </motion.span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
