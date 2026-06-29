"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import { FiSun, FiMoon } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─────────────────────────────────────────────────────
   Web Audio API Synthesizer for Lamp Interaction Sounds
 ───────────────────────────────────────────────────── */
let globalCtx = null;
const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!globalCtx) {
    globalCtx = new AudioContext();
  }
  return globalCtx;
};

const playAcousticShimmer = (ctx) => {
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const f = [523.25, 659.25, 783.99, 1046.50][i];
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }, i * 60);
  }
};

const playTapSound = (ctx) => {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(980, now);
  osc.frequency.exponentialRampToValueAtTime(490, now + 0.2);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(now + 0.2);
};

const unlockAudio = () => {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
  } catch (e) {}

  window.removeEventListener("click", unlockAudio);
  window.removeEventListener("touchstart", unlockAudio);
  window.removeEventListener("touchend", unlockAudio);
  window.removeEventListener("mouseup", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
};

if (typeof window !== "undefined") {
  window.addEventListener("click", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
  window.addEventListener("touchend", unlockAudio, { passive: true });
  window.addEventListener("mouseup", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}

const playSound = (type) => {
  if (typeof window === "undefined") return Promise.resolve();

  try {
    const ctx = getAudioContext();
    if (!ctx) return Promise.resolve();

    if (type === "pull") {
      if (ctx.state === "suspended") {
        return ctx.resume().then(() => {
          if (ctx.state === "suspended") {
            return Promise.reject(new Error("AudioContext suspended"));
          }
          playAcousticShimmer(ctx);
          return Promise.resolve();
        }).catch(() => {
          return Promise.reject(new Error("AudioContext suspended"));
        });
      }

      playAcousticShimmer(ctx);
      return Promise.resolve();
    }

    if (type === "tap") {
      if (ctx.state === "suspended") {
        return ctx.resume().then(() => {
          playTapSound(ctx);
          return Promise.resolve();
        }).catch(() => {});
      }
      playTapSound(ctx);
      return Promise.resolve();
    }
  } catch (e) {
    console.error("Failed to play interaction sound:", e);
  }
  return Promise.resolve();
};

/* ─────────────────────────────────────────────────────
   Animated Lamp SVG – interactive pull-cord toggle
───────────────────────────────────────────────────── */
function LampSVG({ isOn, onToggle, color, isDark }) {
  const [dragging, setDragging] = useState(false);
  const [handleDy, setHandleDy] = useState(0);
  const startYRef = useRef(0);
  const latestDyRef = useRef(0);
  const playPullOnReleaseRef = useRef(false);

  const THRESHOLD = 28;
  const MAX_DY = 68;
  const CORD_ATTACH_X = 73;
  const CORD_ATTACH_Y = 152;
  const HANDLE_BASE_X = 28;
  const HANDLE_BASE_Y = 222;

  const handleY = HANDLE_BASE_Y + handleDy;

  // Theme-aware "off" colours
  const offShade = isDark ? "#283446" : "#cbd5e1";
  const offRim = isDark ? "#37475f" : "#94a3b8";
  const offPole = isDark ? "#5c6d84" : "#718096";
  const offBase = isDark ? "#46556b" : "#a0aec0";
  const offCord = isDark ? "#5c6d84" : "#718096";

  const beamColor = isDark ? color : "#fbbf24";

  /* ── Drag / click handlers ── */
  const handleLampClick = useCallback(() => {
    onToggle();
    playSound("tap");
  }, [onToggle]);

  const beginDrag = useCallback((e) => {
    startYRef.current = e.touches ? e.touches[0].clientY : e.clientY;
    latestDyRef.current = 0;
    setHandleDy(0);
    setDragging(true);
    
    const promise = playSound("pull");
    if (promise && typeof promise.catch === "function") {
      promise.catch((err) => {
        if (err.name === "NotAllowedError" || err.message?.includes("interact")) {
          playPullOnReleaseRef.current = true;
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      if (e.cancelable) e.preventDefault();
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dist = Math.max(0, Math.min(MAX_DY, cy - startYRef.current));
      latestDyRef.current = dist;
      setHandleDy(dist);
    };

    const onEnd = () => {
      const d = latestDyRef.current;
      if (d < 5 || d >= THRESHOLD) onToggle();
      setDragging(false);
      setHandleDy(0);

      if (playPullOnReleaseRef.current) {
        playPullOnReleaseRef.current = false;
        playSound("pull");
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging, isOn, onToggle]);

  return (
    <svg
      viewBox="0 0 200 290"
      className="w-full h-full"
      style={{ userSelect: "none", touchAction: "none" }}
      aria-label={
        isOn ? "Lamp is on" : "Lamp is off – pull the cord to turn on"
      }
    >
      <defs>
        {/* Down-cone light beam */}
        <radialGradient id="coneGrad" cx="50%" cy="0%" r="85%">
          <stop
            offset="0%"
            stopColor={beamColor}
            stopOpacity={isOn ? (isDark ? "0.28" : "0.35") : "0"}
          />
          <stop offset="100%" stopColor={beamColor} stopOpacity="0" />
        </radialGradient>

        {/* Shade fill gradient */}
        <linearGradient id="shadeGrad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor={isOn ? color : offShade} />
          <stop
            offset="100%"
            stopColor={isOn ? color + "99" : offShade + "66"}
          />
        </linearGradient>

        {/* Glow for lit shade */}
        <filter id="shadeGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Light cone ── */}
      <polygon
        points="50,152 150,152 192,282 8,282"
        fill="url(#coneGrad)"
        style={{ opacity: isOn && isDark ? 1 : 0, transition: "opacity 0.9s" }}
      />

      {/* ══ Lamp body – clickable to toggle ══ */}
      <g
        onClick={handleLampClick}
        style={{ cursor: "pointer" }}
        role="button"
        aria-label="Click lamp to toggle light"
      >
        {/* Shade body */}
        <polygon
          points="80,52 120,52 150,152 50,152"
          fill="url(#shadeGrad)"
          stroke={isOn ? color : offRim}
          strokeWidth="1.5"
          filter={isOn && isDark ? "url(#shadeGlow)" : "none"}
          style={{ transition: "stroke 0.6s" }}
        />

        {/* Top rim */}
        <ellipse
          cx="100"
          cy="52"
          rx="20"
          ry="5"
          fill={isOn ? color : offRim}
          style={{ transition: "fill 0.6s" }}
        />

        {/* Bottom rim */}
        <ellipse
          cx="100"
          cy="152"
          rx="50"
          ry="11"
          fill={isOn ? color : offRim}
          style={{ transition: "fill 0.6s" }}
        />

        {/* Interior / bulb glow */}
        <ellipse
          cx="100"
          cy="152"
          rx="44"
          ry="8"
          fill={isOn ? "#fff9e0" : isDark ? "#141b27" : "#b0c0d0"}
          opacity={isOn ? 0.8 : 1}
          style={{ transition: "fill 0.7s, opacity 0.7s" }}
        />
      </g>

      {/* ══ Face ══ */}
      {isOn ? (
        /* Happy / awake */
        <g>
          {/* Left eye */}
          <circle cx="87" cy="97" r="5.5" fill="white" opacity="0.93" />
          <circle cx="88.5" cy="98.5" r="2.5" fill="#181828" />
          {/* Right eye */}
          <circle cx="113" cy="97" r="5.5" fill="white" opacity="0.93" />
          <circle cx="114.5" cy="98.5" r="2.5" fill="#181828" />
          {/* Smile */}
          <path
            d="M 86 115 Q 100 127 114 115"
            stroke="white"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.9"
          />
          {/* Tongue */}
          <ellipse
            cx="100"
            cy="123"
            rx="5"
            ry="3.5"
            fill="#ff9060"
            opacity="0.85"
          />
          {/* Blush */}
          <ellipse
            cx="79"
            cy="110"
            rx="5.5"
            ry="3"
            fill="#ffaa88"
            opacity="0.5"
          />
          <ellipse
            cx="121"
            cy="110"
            rx="5.5"
            ry="3"
            fill="#ffaa88"
            opacity="0.5"
          />
        </g>
      ) : (
        /* Sleeping */
        <g>
          {/* Closed-eye arcs */}
          <path
            d="M 82,94 Q 87,88 92,94"
            stroke={isDark ? "#8a9cb4" : "#5a6b82"}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 108,94 Q 113,88 118,94"
            stroke={isDark ? "#8a9cb4" : "#5a6b82"}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
          {/* Neutral mouth */}
          <path
            d="M 90,111 Q 100,115 110,111"
            stroke={isDark ? "#71859e" : "#4a5a70"}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
          {/* Floating ZZZs */}
          <text
            x="121"
            y="83"
            fontSize="9"
            fill={isDark ? "#4cc9d0" : "#bb5e3a"}
            opacity={0.8}
            fontFamily="sans-serif"
            fontWeight="600"
          >
            z
          </text>
          <text
            x="129"
            y="75"
            fontSize="7"
            fill={isDark ? "#4cc9d0" : "#bb5e3a"}
            opacity={0.5}
            fontFamily="sans-serif"
            fontWeight="600"
          >
            z
          </text>
          <text
            x="135"
            y="68"
            fontSize="5"
            fill={isDark ? "#4cc9d0" : "#bb5e3a"}
            opacity={0.3}
            fontFamily="sans-serif"
            fontWeight="600"
          >
            z
          </text>
        </g>
      )}

      {/* ══ Pole ══ */}
      <rect
        x="97"
        y="152"
        width="6"
        height="76"
        rx="3"
        fill={isOn ? "#d4d8e2" : offPole}
        style={{ transition: "fill 0.6s" }}
      />

      {/* ══ Base ══ */}
      <ellipse
        cx="100"
        cy="232"
        rx="26"
        ry="7"
        fill={isOn ? "#bcc0cc" : offBase}
        style={{ transition: "fill 0.6s" }}
      />
      <ellipse
        cx="100"
        cy="228"
        rx="19"
        ry="5"
        fill={isOn ? "#ccd0dc" : isDark ? "#323844" : "#9898a4"}
        style={{ transition: "fill 0.6s" }}
      />

      {/* ══ Pull cord ══ */}
      <line
        x1={CORD_ATTACH_X}
        y1={CORD_ATTACH_Y}
        x2={HANDLE_BASE_X}
        y2={handleY}
        stroke={isOn ? "#aab0c0" : offCord}
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{ transition: dragging ? "none" : "stroke 0.6s" }}
      />

      {/* Invisible larger touch target */}
      <circle
        cx={HANDLE_BASE_X}
        cy={handleY}
        r="22"
        fill="transparent"
        style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
        onMouseDown={beginDrag}
        onTouchStart={beginDrag}
      />

      {/* Visible cord bead */}
      <circle
        cx={HANDLE_BASE_X}
        cy={handleY}
        r="8"
        fill={isOn ? "#c4cad8" : isDark ? "#5c6d84" : "#a0aec0"}
        stroke={isOn ? "#9aa0b0" : offCord}
        strokeWidth="1.5"
        style={{
          pointerEvents: "none",
          filter: dragging ? `drop-shadow(0 4px 10px ${color}60)` : "none",
          transition: dragging ? "none" : "fill 0.6s, stroke 0.6s",
        }}
      />

      {/* Pull-down arrow hint when lamp is off */}
      {!isOn && !dragging && (
        <g style={{ opacity: 0.65 }}>
          <line
            x1={HANDLE_BASE_X}
            y1={handleY + 13}
            x2={HANDLE_BASE_X}
            y2={handleY + 22}
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <polyline
            points={`${HANDLE_BASE_X - 4},${handleY + 19} ${HANDLE_BASE_X},${handleY + 24} ${HANDLE_BASE_X + 4},${handleY + 19}`}
            stroke={color}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────
   Main Auth Page
───────────────────────────────────────────────────── */
export default function AuthPage() {
  const {
    user,
    signInWithGoogle,
    signInWithGoogleSelectAccount,
    signInAsGuest,
    loading,
    signInWithApple,
  } = useAuth();

  const { theme, setTheme, resolvedTheme } = useTheme();
  const router = useRouter();

  const [signingIn, setSigningIn] = useState("");
  const [error, setError] = useState("");
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [lampOn, setLampOn] = useState(false);
  const [introCompleted, setIntroCompleted] = useState(false);
  const [introFadeOut, setIntroFadeOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showAppleButton, setShowAppleButton] = useState(false);
 
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const isAndroidCheck = /Android/i.test(navigator.userAgent);
      setShowAppleButton(!isAndroidCheck);
    }
  }, []);

  const activeTheme = mounted ? resolvedTheme : "dark";
  const isDark = activeTheme === "dark";
  const isApp = mounted && typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const primaryColor = isDark ? "#4cc9d0" : "#bb5e3a";

  /* ── Intro timing ── */
  useEffect(() => {
    const t = setTimeout(() => {
      setIntroFadeOut(true);
      const ft = setTimeout(() => setIntroCompleted(true), 300);
      return () => clearTimeout(ft);
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  /* ── Redirect when authenticated ── */
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  /* ── Android back button ── */
  useEffect(() => {
    const handler = () => {
      if (showGuestForm) {
        setShowGuestForm(false);
      } else {
        const isTauri =
          typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
        if (isTauri) {
          import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke("exit_app").catch(() => { }))
            .catch(() => { });
        }
      }
    };
    window.addEventListener("android-back-button", handler);
    return () => window.removeEventListener("android-back-button", handler);
  }, [showGuestForm]);

  const getFriendlyError = (code) =>
    ({
      "auth/popup-blocked":
        "Browser blocked the popup. Please allow popups and try again.",
      "auth/popup-closed-by-user": "Sign in cancelled. Please try again.",
      "auth/network-request-failed":
        "Please check your internet connection and try again.",
      "auth/too-many-requests": "Too many requests. Please try again later.",
      "auth/user-disabled": "This account has been disabled.",
    })[code] ?? "Sign in failed. Please try again.";

  const handleGoogle = async () => {
    setSigningIn("google");
    setError("");
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (e) {
      setError(e?.code ? getFriendlyError(e.code) : e?.message || String(e));
    } finally {
      setSigningIn("");
    }
  };

  const handleApple = async () => {
    setSigningIn("apple");
    setError("");
    try {
      await signInWithApple();
      router.replace("/");
    } catch (e) {
      setError(e?.code ? getFriendlyError(e.code) : e?.message || String(e));
    } finally {
      setSigningIn("");
    }
  };
 
  const handleGuestLogin = async () => {
    if (!guestName.trim()) return;
    setSigningIn("guest");
    setError("");
    try {
      await signInAsGuest(guestName.trim());
      router.replace("/");
    } catch (e) {
      setError(e?.code ? getFriendlyError(e.code) : e?.message || String(e));
    } finally {
      setSigningIn("");
    }
  };

  const handleToggleLamp = useCallback(() => setLampOn((p) => !p), []);

  /* ════════════════════════════════
     INTRO SCREEN
  ════════════════════════════════ */
  if (loading || !introCompleted) {
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background bg-auth-pattern transition-all duration-300 ${introFadeOut && !loading ? "animate-intro-container-fadeout" : ""
          }`}
      >
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="fixed right-6 z-50 w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 flex items-center justify-center rounded-xl bg-card border border-border/80 text-foreground hover:bg-muted/80 shadow-md active:scale-95 transition-all duration-150"
            style={{
              top: isApp ? "calc(2.8rem + env(safe-area-inset-top, 0px))" : "calc(1.5rem + env(safe-area-inset-top, 0px))"
            }}
            aria-label="Toggle Theme"
          >
            {theme === "dark" ? (
              <FiSun className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6 text-yellow-400" />
            ) : (
              <FiMoon className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6 text-slate-700" />
            )}
          </button>
        )}

        <div className="flex flex-col items-center gap-6 z-10">
          <div className="w-28 h-28 rounded-full overflow-hidden border border-border/40 shadow-xl flex items-center justify-center animate-intro-logo bg-card">
            <img
              src="/lightLogo.png"
              alt="Lazy Notes"
              className="w-full h-full object-cover dark:hidden"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/lazyNoteIcon.png";
              }}
            />
            <img
              src="/lazyNoteIcon.png"
              alt="Lazy Notes"
              className="w-full h-full object-cover hidden dark:block"
            />
          </div>

          <div className="flex flex-col items-center gap-2">
            <h1 className="animate-intro-text text-3xl font-extrabold tracking-widest text-foreground">
              Lazy <span className="text-primary">Notes</span>
            </h1>
            <p
              className="animate-intro-text text-xs text-muted-foreground tracking-wide"
              style={{ animationDelay: "0.4s" }}
            >
              Just Note Like Lazy Person
            </p>
          </div>

          <div className="w-24 h-[3px] bg-muted rounded-full overflow-hidden relative mt-2">
            <div className="absolute inset-y-0 left-0 bg-primary animate-intro-loader rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════
     MAIN LOGIN PAGE
  ════════════════════════════════ */
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background overflow-hidden">
      {/* Ambient background glow when lamp is on */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-1000"
        style={{
          opacity: lampOn ? 1 : 0,
          background: mounted
            ? isDark
              ? `radial-gradient(ellipse 55% 70% at 22% 52%, ${primaryColor}18 0%, transparent 70%)`
              : "none"
            : "none",
        }}
      />

      {/* Theme toggle */}
      {mounted && (
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="fixed right-6 z-50 w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 flex items-center justify-center rounded-xl bg-card border border-border/80 text-foreground hover:bg-muted/80 shadow-md active:scale-95 transition-all duration-150"
          style={{
            top: isApp ? "calc(2.8rem + env(safe-area-inset-top, 0px))" : "calc(1.5rem + env(safe-area-inset-top, 0px))"
          }}
          aria-label="Toggle Theme"
        >
          {theme === "dark" ? (
            <FiSun className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6 text-yellow-400" />
          ) : (
            <FiMoon className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6 text-slate-700" />
          )}
        </button>
      )}

      {/* ── Content ── */}
      <div className={`relative z-10 w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto px-5 flex flex-col lg:flex-row items-center justify-center h-[100dvh] lg:h-auto lg:min-h-0 lg:py-16 overflow-hidden lg:overflow-visible auth-content-container ${isApp ? "pt-12 lg:pt-0" : ""}`}>
        {/* ══ Lamp section ══ */}
        <div className="flex flex-col items-center gap-2 lg:gap-3 xl:gap-4 shrink-0 h-[min(210px,42dvh)] lg:h-auto justify-end pb-1 lg:pb-0">
          <div className="flex-1 w-[165px] lg:w-[340px] lg:h-[440px] xl:w-[420px] xl:h-[540px] lg:flex-none">
            {mounted && (
              <LampSVG
                isOn={lampOn}
                onToggle={handleToggleLamp}
                color={primaryColor}
                isDark={isDark}
              />
            )}
          </div>
          {!lampOn && (
            <p className="text-xs md:text-sm lg:text-base font-medium select-none text-center text-muted-foreground opacity-70">
              Tap the lamp or pull the cord
            </p>
          )}
        </div>

        {/* Desktop-only gap spacer that grows when form appears */}
        <div
          className="hidden lg:block shrink-0 lg:[--gap-width:4.5rem] xl:[--gap-width:6.5rem]"
          style={{
            width: lampOn ? "var(--gap-width, 3.5rem)" : "0",
            transition: "width 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        />

        {/* ══ Form section — collapses to 0 when lamp is off ══ */}
        <div
          className="flex-1 min-h-0 lg:flex-none shrink-0 overflow-hidden w-full lg:[--form-max-width:38rem] xl:[--form-max-width:44rem]"
          style={{
            maxWidth: lampOn ? "var(--form-max-width, min(32rem, 100%))" : "0",
            maxHeight: lampOn ? "900px" : "0",
            opacity: lampOn ? 1 : 0,
            pointerEvents: lampOn ? "auto" : "none",
            transition:
              "max-width 0.7s cubic-bezier(0.16,1,0.3,1), max-height 0.7s cubic-bezier(0.16,1,0.3,1), opacity 0.55s ease",
          }}
        >
          {/* Inner: fills height on mobile for internal scroll, auto on desktop */}
          <div className="h-full lg:h-auto overflow-y-auto lg:overflow-visible pt-3 lg:pt-0 pb-3 lg:pb-0">
            {/* ── Card ── */}
            <div
              className="rounded-3xl border bg-card backdrop-blur-2xl overflow-hidden"
              style={{
                borderColor: mounted ? (isDark ? `${primaryColor}42` : "var(--border)") : "var(--border)",
                boxShadow: mounted
                  ? isDark
                    ? `0 0 0 1px ${primaryColor}28, 0 12px 60px ${primaryColor}16, 0 24px 70px rgba(0,0,0,0.22)`
                    : `0 1px 2px rgba(0,0,0,0.05), 0 8px 32px rgba(0,0,0,0.04)`
                  : "none",
                transition: "border-color 0.7s, box-shadow 0.7s",
              }}
            >
              {/* Top accent line */}
              <div
                style={{
                  height: "2px",
                  background: mounted
                    ? isDark
                      ? `linear-gradient(90deg, transparent 0%, ${primaryColor}88 40%, ${primaryColor}88 60%, transparent 100%)`
                      : "transparent"
                    : "transparent",
                  transition: "opacity 0.7s",
                  opacity: lampOn ? 1 : 0,
                }}
              />

              <div className="p-6 sm:p-8 md:p-10 lg:p-12 space-y-5 md:space-y-6 lg:space-y-8">
                {/* Header: logo + title */}
                <div className="flex flex-col items-center gap-3 md:gap-4 lg:gap-5 pb-1 md:pb-2 lg:pb-3">
                  <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full overflow-hidden border border-border/40 shadow-lg bg-card shrink-0">
                    <img
                      src="/lightLogo.png"
                      alt="Lazy Notes"
                      className="w-full h-full object-cover dark:hidden"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/lazyNoteIcon.png";
                      }}
                    />
                    <img
                      src="/lazyNoteIcon.png"
                      alt="Lazy Notes"
                      className="w-full h-full object-cover hidden dark:block"
                    />
                  </div>
                  <div className="text-center">
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
                      Lazy{" "}
                      <span
                        style={{
                          color: mounted ? primaryColor : "var(--primary)",
                        }}
                      >
                        Notes
                      </span>
                    </h1>
                    <p className="text-xs md:text-sm lg:text-base text-muted-foreground mt-0.5 lg:mt-1">
                      Just Note Like A Lazy Person
                    </p>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="p-3 md:p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm md:text-base text-destructive text-center font-medium">
                    {error}
                  </div>
                )}

                {/* Continue as Guest — full-width button */}
                <button
                  type="button"
                  onClick={() => setShowGuestForm((s) => !s)}
                  aria-expanded={showGuestForm}
                  className="w-full flex items-center justify-center gap-2 md:gap-2.5 lg:gap-3 h-11 md:h-12 lg:h-14 px-4 md:px-5 lg:px-6 rounded-xl text-sm md:text-base lg:text-lg font-semibold border transition-all active:scale-[0.98] hover:opacity-90"
                  style={{
                    background: mounted ? `${primaryColor}14` : "transparent",
                    borderColor: mounted
                      ? `${primaryColor}38`
                      : "var(--border)",
                    color: mounted ? primaryColor : "var(--primary)",
                  }}
                >
                  <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                      style={{
                        background: mounted ? primaryColor : "var(--primary)",
                      }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-full w-full"
                      style={{
                        background: mounted ? primaryColor : "var(--primary)",
                      }}
                    />
                  </span>
                  {showGuestForm ? "← Back to Sign In" : "Continue as Guest"}
                </button>

                {/* Guest form */}
                {showGuestForm && (
                  <div className="space-y-3 md:space-y-4 lg:space-y-5 animate-card-enter">
                    <div className="space-y-1.5">
                      <label className="text-[10px] md:text-[11px] lg:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Your Name
                      </label>
                      <Input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Enter your name"
                        className="h-11 md:h-12 lg:h-14 md:text-base lg:text-lg rounded-xl bg-background/80 border-border/70 text-foreground"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleGuestLogin();
                        }}
                      />
                    </div>
                    <div className="p-3 md:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] md:text-xs lg:text-sm text-amber-600 dark:text-amber-400 font-medium leading-relaxed">
                      ⚠️ <strong>Local only</strong> — data won't be backed up
                      to the cloud.
                    </div>
                    <Button
                      onClick={handleGuestLogin}
                      disabled={!!signingIn || !guestName.trim()}
                      className="w-full h-11 md:h-12 lg:h-14 md:text-base lg:text-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl disabled:opacity-50"
                    >
                      {signingIn === "guest" ? "Entering…" : "Start as Guest"}
                    </Button>
                  </div>
                )}

                {/* OR divider */}
                {!showGuestForm && (
                  <div className="flex items-center gap-3 md:gap-4 lg:gap-5">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="text-[10px] md:text-[11px] lg:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      or
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}

                {/* Google sign-in */}
                {!showGuestForm && (
                  <Button
                    onClick={handleGoogle}
                    disabled={!!signingIn}
                    className="w-full h-12 md:h-13 lg:h-15 gap-3 md:gap-4 lg:gap-5 text-sm md:text-base lg:text-lg font-semibold rounded-xl bg-background/60 hover:bg-muted/70 border border-border/70 shadow-sm active:scale-[0.98] transition-all text-foreground"
                    variant="outline"
                  >
                    <FcGoogle className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 shrink-0" />
                    {signingIn === "google" ? "Signing in…" : "Continue with Google"}
                  </Button>
                )}

                {/* Apple sign-in */}
                {!showGuestForm && showAppleButton && (
                  <Button
                    onClick={handleApple}
                    disabled={!!signingIn}
                    className="w-full h-12 md:h-13 lg:h-15 gap-3 md:gap-4 lg:gap-5 text-sm md:text-base lg:text-lg font-semibold rounded-xl bg-black hover:bg-black/90 border border-black/70 shadow-sm active:scale-[0.98] transition-all text-white dark:bg-white dark:hover:bg-white/90 dark:text-black dark:border-white/70"
                    variant="outline"
                  >
                    <FaApple className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 shrink-0" />
                    {signingIn === "apple" ? "Signing in…" : "Sign in with Apple"}
                  </Button>
                )}

                {/* Footer */}
                <div className="pt-3 md:pt-4 lg:pt-5 border-t border-border/30 flex flex-col items-center text-center gap-1.5 md:gap-2 lg:gap-2.5">
                  <button
                    type="button"
                    onClick={() => signInWithGoogleSelectAccount()}
                    className="text-[11px] md:text-xs lg:text-sm font-semibold transition-all text-center"
                    style={{ color: mounted ? primaryColor : "var(--primary)" }}
                  >
                    Use a different Google account
                  </button>
                  <p className="text-[10px] md:text-[11px] lg:text-xs text-muted-foreground/50 leading-relaxed text-center">
                    By continuing, you agree to our{" "}
                    <Link
                      href="/privacy"
                      className="font-semibold hover:underline"
                      style={{
                        color: mounted ? primaryColor : "var(--primary)",
                      }}
                    >
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
