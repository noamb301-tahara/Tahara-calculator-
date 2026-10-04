import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Adam: the channel's host character. Half human, half robot: a porcelain human
 * face (eyes, brows, lips) on a sleek graphite-and-silver shell, with an exposed
 * circuit panel on one temple and a glowing ear module. Original design, own palette
 * (silver, teal, violet).
 *
 * Fully procedural (SVG), so it renders anywhere, costs nothing, and animates:
 * blinks, breathing, gaze, and a mouth that moves while `speaking`.
 */

export interface AdamProps {
  /** Pixel size of the character's bounding box (the art is 600×760). */
  size?: number;
  /** Mouth moves while true. Optionally pass a 0..1 level per frame instead. */
  speaking?: boolean;
  level?: number;
  /** Where Adam looks: -1..1 on each axis. */
  gaze?: { x: number; y: number };
  /** "smile" curves the lips; "focus" narrows the eyes a little. */
  mood?: "neutral" | "smile" | "focus";
  /** Accent glow colour (eyes, circuits, emblem). */
  accent?: string;
}

export const ADAM_COLORS = {
  accent: "#2de2e6",
  violet: "#8b5cf6",
  shell: "#2a2f3a",
  shellHi: "#4a5263",
  skin: "#f3e4da",
  skinShade: "#d9c1b4",
  lip: "#c98f96",
};

/** Deterministic pseudo-speech envelope for frames without audio analysis. */
export function mouthOpen(frame: number, speaking: boolean): number {
  if (!speaking) return 0;
  const a = Math.abs(Math.sin(frame * 0.83) * Math.sin(frame * 0.29 + 1.3));
  const b = Math.abs(Math.sin(frame * 0.51 + 0.4));
  return Math.min(1, 0.15 + 0.6 * a + 0.35 * b * b);
}

export const Adam: React.FC<AdamProps> = ({ size = 600, speaking = false, level, gaze = { x: 0, y: 0 }, mood = "smile", accent = ADAM_COLORS.accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const C = ADAM_COLORS;

  // Blink about every 3.7s (two quick frames closed), never in sync with anything else.
  const phase = (t + 1.1) % 3.7;
  const blink = phase < 0.13 ? interpolate(phase, [0, 0.06, 0.13], [1, 0.05, 1]) : 1;
  const breathe = Math.sin(t * 1.6) * 4;
  const tilt = Math.sin(t * 0.7) * 1.4;
  const open = level ?? mouthOpen(frame, speaking);
  const glow = 0.75 + 0.25 * Math.sin(t * 3.1);
  const eyeH = (mood === "focus" ? 0.82 : 1) * blink;
  const gx = gaze.x * 7;
  const gy = gaze.y * 5;
  const smile = mood === "smile" ? 9 : 2;

  const eye = (cx: number) => (
    <g transform={`translate(${cx} 352) scale(1 ${eyeH}) translate(${-cx} -352)`}>
      <path d={`M${cx - 44} 352 Q${cx} 318 ${cx + 44} 352 Q${cx} 380 ${cx - 44} 352 Z`} fill="#fbfdff" stroke={C.skinShade} strokeWidth={2} />
      <clipPath id={`eye-${cx}`}>
        <path d={`M${cx - 44} 352 Q${cx} 318 ${cx + 44} 352 Q${cx} 380 ${cx - 44} 352 Z`} />
      </clipPath>
      <g clipPath={`url(#eye-${cx})`}>
        <circle cx={cx + gx} cy={350 + gy} r={21} fill="url(#iris)" />
        <circle cx={cx + gx} cy={350 + gy} r={21} fill="none" stroke={accent} strokeOpacity={0.9 * glow} strokeWidth={2.5} />
        <circle cx={cx + gx} cy={350 + gy} r={8.5} fill="#081018" />
        <circle cx={cx + gx - 7} cy={343 + gy} r={4.5} fill="#ffffff" opacity={0.95} />
      </g>
      {/* Upper lid line */}
      <path d={`M${cx - 46} 351 Q${cx} 314 ${cx + 46} 351`} fill="none" stroke="#5a6272" strokeWidth={4} strokeLinecap="round" />
    </g>
  );

  return (
    <svg width={size} height={(size * 760) / 600} viewBox="0 0 600 760" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="halo" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.35 * glow} />
          <stop offset="55%" stopColor={C.violet} stopOpacity={0.12} />
          <stop offset="100%" stopColor={C.violet} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbf3ee" />
          <stop offset="60%" stopColor={C.skin} />
          <stop offset="100%" stopColor={C.skinShade} />
        </linearGradient>
        <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.shellHi} />
          <stop offset="100%" stopColor={C.shell} />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b4252" />
          <stop offset="100%" stopColor="#151922" />
        </linearGradient>
        <radialGradient id="iris" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#c9fbff" />
          <stop offset="45%" stopColor={accent} />
          <stop offset="100%" stopColor="#0d5e73" />
        </radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <ellipse cx={300} cy={330} rx={290} ry={330} fill="url(#halo)" />

      <g transform={`translate(0 ${breathe}) rotate(${tilt} 300 420)`}>
        {/* Shoulders + collar: graphite armour with glowing seams */}
        <path d="M70 760 C80 640 170 590 300 588 C430 590 520 640 530 760 Z" fill="url(#shell)" />
        <path d="M150 650 C210 620 390 620 450 650" fill="none" stroke={accent} strokeOpacity={0.55 * glow} strokeWidth={3} />
        <path d="M232 588 L250 640 L350 640 L368 588" fill="#1b1f28" stroke="#596173" strokeWidth={2} />
        {/* Chest emblem: hexagon with an "A" */}
        <g transform="translate(300 690)">
          <path d="M0 -30 L26 -15 L26 15 L0 30 L-26 15 L-26 -15 Z" fill="#121620" stroke={accent} strokeWidth={3} strokeOpacity={glow} />
          <path d="M-10 12 L0 -13 L10 12 M-6 4 L6 4" fill="none" stroke={accent} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" opacity={glow} />
        </g>

        {/* Neck: segmented, mechanical */}
        <rect x={258} y={520} width={84} height={80} rx={18} fill="#3a4150" />
        {[540, 560, 580].map((y) => (
          <rect key={y} x={262} y={y} width={76} height={6} rx={3} fill="#252a35" />
        ))}

        {/* Head shell (back of the skull, ears) */}
        <path d="M150 300 C150 150 225 92 300 92 C375 92 450 150 450 300 L450 380 C450 470 390 545 300 548 C210 545 150 470 150 380 Z" fill="url(#shell)" />
        {/* Ear module (left) and glowing ring (right) */}
        <rect x={128} y={318} width={34} height={84} rx={16} fill="#3a4150" />
        <circle cx={458} cy={360} r={30} fill="#1a1e27" stroke="#5b6476" strokeWidth={4} />
        <circle cx={458} cy={360} r={17} fill="none" stroke={accent} strokeWidth={5} opacity={glow} />
        <circle cx={458} cy={360} r={17} fill="none" stroke={accent} strokeWidth={10} opacity={0.25 * glow} filter="url(#soft)" />

        {/* Face plate: porcelain, human proportions */}
        <path d="M178 290 C178 175 235 128 300 128 C365 128 422 175 422 290 L422 372 C422 458 370 522 300 525 C230 522 178 458 178 372 Z" fill="url(#skin)" />

        {/* Sculpted "hair": graphite plates swept to the side, one glowing streak */}
        <path d="M172 262 C170 168 236 108 312 110 C392 114 436 170 430 246 C410 208 372 186 330 186 C290 186 252 200 222 226 C204 240 186 252 172 262 Z" fill="url(#shell)" />
        <path d="M212 210 C252 168 306 152 360 160" fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" opacity={0.7 * glow} />
        <path d="M236 150 C270 132 316 128 352 138" fill="none" stroke="#6b7488" strokeWidth={3} strokeLinecap="round" />

        {/* Exposed circuit panel on the right temple: the "robot half" */}
        <path d="M372 150 C408 172 422 220 422 290 L422 352 C405 350 386 338 378 318 C368 292 382 262 372 236 C362 210 340 196 344 172 Z" fill="url(#panel)" />
        <g stroke={accent} strokeWidth={2.5} fill="none" opacity={0.85 * glow} strokeLinecap="round">
          <path d="M358 186 L386 202 L386 238" />
          <path d="M400 230 L400 280 L414 292" />
          <path d="M384 262 L392 300 L410 318" />
        </g>
        {[[386, 238], [414, 292], [410, 318], [358, 186]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={4.5} fill={accent} opacity={glow} />
        ))}
        <path d="M344 172 C340 196 362 210 372 236 C382 262 368 292 378 318 C386 338 405 350 422 352" fill="none" stroke="#9aa5b7" strokeWidth={2.5} />

        {/* Panel seams on the human side: subtle, so the face still reads as human */}
        <path d="M214 452 C238 486 266 502 300 506" fill="none" stroke={C.skinShade} strokeWidth={2} opacity={0.7} />
        {/* Cheeks */}
        <ellipse cx={226} cy={424} rx={30} ry={16} fill="#e7868f" opacity={0.18} />
        <ellipse cx={364} cy={424} rx={26} ry={14} fill="#e7868f" opacity={0.14} />

        {/* Brows */}
        <path d="M200 304 Q240 284 280 298" fill="none" stroke="#545c6b" strokeWidth={8} strokeLinecap="round" />
        <path d="M320 298 Q360 284 398 302" fill="none" stroke="#545c6b" strokeWidth={8} strokeLinecap="round" />

        {eye(242)}
        {eye(358)}

        {/* Nose */}
        <path d="M300 372 C296 398 292 414 284 424 C292 430 306 431 314 426" fill="none" stroke={C.skinShade} strokeWidth={4} strokeLinecap="round" />

        {/* Mouth: lips + opening that follows speech */}
        <g transform="translate(300 466)">
          <path d={`M-46 0 Q0 ${smile + 6 + open * 18} 46 0`} fill="#2a1d26" opacity={open > 0.05 ? 1 : 0} />
          <path d={`M-48 0 Q-24 -12 0 -7 Q24 -12 48 0 Q24 ${-2 + open * 4} 0 ${-1 + open * 4} Q-24 ${-2 + open * 4} -48 0 Z`} fill={C.lip} />
          <path d={`M-48 0 Q0 ${smile + 14 + open * 20} 48 0 Q0 ${smile + 4 + open * 18} -48 0 Z`} fill={C.lip} opacity={0.95} />
        </g>

        {/* Chin light */}
        <ellipse cx={300} cy={512} rx={28} ry={6} fill="#ffffff" opacity={0.35} />
      </g>
    </svg>
  );
};
