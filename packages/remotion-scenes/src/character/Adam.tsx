import React, { useId } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Adam: the channel's host. An android: synthetic human skin on the front of the
 * face only; the rest of the skull is a translucent mesh shell with glowing
 * internals, a machined metal neck with exposed cables, and camera-lens eyes.
 * Original design, own palette (gunmetal, teal, violet). Lit from the upper left
 * with soft shadows and specular highlights.
 *
 * Fully procedural (SVG), so it renders anywhere, costs nothing, and animates:
 * blinks, breathing, gaze, a lens "focus" pulse, and a mouth that moves while
 * `speaking`.
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
  /** Accent glow colour (eyes, internals, emblem). */
  accent?: string;
}

export const ADAM_COLORS = {
  accent: "#2de2e6",
  violet: "#8b5cf6",
  metal: "#8d96a6",
  metalDark: "#262b35",
  skin: "#efdccf",
  skinShade: "#c9ab9b",
  lip: "#b98288",
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
  // Unique ids: several Adams can share a frame without clashing gradients.
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const t = frame / fps;
  const C = ADAM_COLORS;

  const phase = (t + 1.1) % 3.7;
  const blink = phase < 0.13 ? interpolate(phase, [0, 0.06, 0.13], [1, 0.05, 1]) : 1;
  const breathe = Math.sin(t * 1.6) * 3;
  const tilt = Math.sin(t * 0.7) * 1.2;
  const open = level ?? mouthOpen(frame, speaking);
  const glow = 0.72 + 0.28 * Math.sin(t * 3.1);
  const aperture = 0.82 + 0.18 * Math.sin(t * 0.9);
  const eyeH = (mood === "focus" ? 0.8 : 1) * blink;
  const gx = gaze.x * 7;
  const gy = gaze.y * 5;
  const smile = mood === "smile" ? 8 : 2;

  const eye = (cx: number, key: string) => (
    <g key={key}>
      {/* Socket shadow */}
      <ellipse cx={cx} cy={350} rx={50} ry={24} fill="#6b4e48" opacity={0.12} filter={`url(#${id("blur6")})`} />
      <g transform={`translate(${cx} 352) scale(1 ${eyeH}) translate(${-cx} -352)`}>
        <path d={`M${cx - 42} 352 Q${cx} 322 ${cx + 42} 352 Q${cx} 378 ${cx - 42} 352 Z`} fill={url("sclera")} />
        <clipPath id={id(`eye${key}`)}>
          <path d={`M${cx - 42} 352 Q${cx} 322 ${cx + 42} 352 Q${cx} 378 ${cx - 42} 352 Z`} />
        </clipPath>
        <g clipPath={`url(#${id(`eye${key}`)})`}>
          {/* Camera-lens iris: dark ring, glowing aperture, glint */}
          <circle cx={cx + gx} cy={350 + gy} r={22} fill="#0c1218" />
          <circle cx={cx + gx} cy={350 + gy} r={18} fill={url("iris")} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line
              key={a}
              x1={cx + gx + Math.cos((a * Math.PI) / 180) * 6 * aperture}
              y1={350 + gy + Math.sin((a * Math.PI) / 180) * 6 * aperture}
              x2={cx + gx + Math.cos(((a + 40) * Math.PI) / 180) * 15}
              y2={350 + gy + Math.sin(((a + 40) * Math.PI) / 180) * 15}
              stroke="#063b48"
              strokeWidth={1.6}
              opacity={0.8}
            />
          ))}
          <circle cx={cx + gx} cy={350 + gy} r={6.5 * aperture} fill="#03080c" />
          <circle cx={cx + gx} cy={350 + gy} r={18} fill="none" stroke={accent} strokeWidth={1.5} opacity={glow} />
          <ellipse cx={cx + gx - 7} cy={342 + gy} rx={5} ry={3.5} fill="#ffffff" opacity={0.9} />
          {/* Upper-lid shadow on the eyeball */}
          <path d={`M${cx - 42} 352 Q${cx} 322 ${cx + 42} 352 L${cx + 42} 340 L${cx - 42} 340 Z`} fill="#3d2a28" opacity={0.25} />
        </g>
        <path d={`M${cx - 44} 351 Q${cx} 318 ${cx + 44} 351`} fill="none" stroke="#3e2f2e" strokeWidth={3.5} strokeLinecap="round" />
        <path d={`M${cx - 36} 362 Q${cx} 378 ${cx + 36} 362`} fill="none" stroke={C.skinShade} strokeWidth={1.5} opacity={0.8} />
      </g>
      {/* Eyelid crease */}
      <path d={`M${cx - 38} 334 Q${cx} 316 ${cx + 40} 336`} fill="none" stroke={C.skinShade} strokeWidth={2} opacity={0.7} />
    </g>
  );

  return (
    <svg width={size} height={(size * 760) / 600} viewBox="0 0 600 760" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={id("halo")} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.28 * glow} />
          <stop offset="55%" stopColor={C.violet} stopOpacity={0.1} />
          <stop offset="100%" stopColor={C.violet} stopOpacity={0} />
        </radialGradient>
        {/* Synthetic skin, lit from upper left */}
        <radialGradient id={id("skin")} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#fbf0e8" />
          <stop offset="45%" stopColor={C.skin} />
          <stop offset="85%" stopColor={C.skinShade} />
          <stop offset="100%" stopColor="#a8897b" />
        </radialGradient>
        {/* Brushed gunmetal */}
        <linearGradient id={id("metal")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c3cad6" />
          <stop offset="30%" stopColor={C.metal} />
          <stop offset="65%" stopColor="#4c5463" />
          <stop offset="100%" stopColor={C.metalDark} />
        </linearGradient>
        <linearGradient id={id("metalV")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a414e" />
          <stop offset="35%" stopColor="#aab2bf" />
          <stop offset="55%" stopColor="#6c7484" />
          <stop offset="100%" stopColor="#262b35" />
        </linearGradient>
        {/* Translucent mesh skull */}
        <radialGradient id={id("glass")} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#dfe8f5" stopOpacity={0.55} />
          <stop offset="60%" stopColor="#7e8ca3" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#1c2230" stopOpacity={0.75} />
        </radialGradient>
        <pattern id={id("mesh")} width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <path d="M0 0 L9 0 M0 0 L0 9" stroke="#c9d3e3" strokeWidth={0.8} opacity={0.35} />
        </pattern>
        <radialGradient id={id("iris")} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#d7fdff" />
          <stop offset="40%" stopColor={accent} />
          <stop offset="100%" stopColor="#08495a" />
        </radialGradient>
        <radialGradient id={id("sclera")} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d9dde3" />
        </radialGradient>
        <linearGradient id={id("lip")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c99398" />
          <stop offset="100%" stopColor="#9f6a71" />
        </linearGradient>
        <filter id={id("blur6")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={id("blur2")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      <ellipse cx={300} cy={330} rx={290} ry={330} fill={url("halo")} />

      <g transform={`translate(0 ${breathe}) rotate(${tilt} 300 420)`}>
        {/* Shoulders: armoured plates with mesh underlay and seams */}
        <path d="M60 760 C70 640 170 594 300 592 C430 594 530 640 540 760 Z" fill={url("metal")} />
        <path d="M60 760 C70 640 170 594 300 592 C430 594 530 640 540 760 Z" fill={url("mesh")} />
        <path d="M120 690 C170 640 240 622 300 622 C360 622 430 640 480 690" fill="none" stroke="#1d222b" strokeWidth={4} />
        <path d="M150 652 C210 626 390 626 450 652" fill="none" stroke={accent} strokeOpacity={0.55 * glow} strokeWidth={2.5} />
        <path d="M110 700 C130 668 160 650 196 640" fill="none" stroke="#e4e9f1" strokeWidth={3} opacity={0.35} />
        {/* Chest emblem */}
        <g transform="translate(300 700)">
          <path d="M0 -28 L24 -14 L24 14 L0 28 L-24 14 L-24 -14 Z" fill="#0f131b" stroke="#9aa3b3" strokeWidth={2} />
          <path d="M-9 11 L0 -12 L9 11 M-5.5 3.5 L5.5 3.5" fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={glow} />
          <circle r={34} fill="none" stroke={accent} strokeWidth={8} opacity={0.18 * glow} filter={`url(#${id("blur6")})`} />
        </g>

        {/* Neck: machined column, pistons and exposed cables */}
        <rect x={262} y={500} width={76} height={104} rx={14} fill={url("metalV")} />
        {[520, 538, 556, 574].map((y) => (
          <rect key={y} x={266} y={y} width={68} height={5} rx={2.5} fill="#1d222b" opacity={0.8} />
        ))}
        <path d="M246 506 C238 548 240 576 250 600" fill="none" stroke="#1f2430" strokeWidth={9} strokeLinecap="round" />
        <path d="M246 506 C238 548 240 576 250 600" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.6 * glow} />
        <path d="M354 506 C362 548 360 576 350 600" fill="none" stroke="#1f2430" strokeWidth={9} strokeLinecap="round" />
        <path d="M354 506 C362 548 360 576 350 600" fill="none" stroke={C.violet} strokeWidth={2} strokeLinecap="round" opacity={0.6} />

        {/* Skull: translucent mesh shell over glowing internals */}
        <path d="M146 300 C146 146 222 86 300 86 C378 86 454 146 454 300 L454 382 C454 470 394 540 300 544 C206 540 146 470 146 382 Z" fill="#141923" />
        <g opacity={1}>
          <path d="M196 170 C230 132 268 120 300 120" fill="none" stroke={accent} strokeWidth={3} opacity={0.55 * glow} />
          <path d="M412 196 C430 240 436 290 430 330" fill="none" stroke={accent} strokeWidth={3} opacity={0.5 * glow} />
          <circle cx={404} cy={214} r={9} fill={accent} opacity={0.75 * glow} filter={`url(#${id("blur2")})`} />
          <circle cx={186} cy={226} r={7} fill={C.violet} opacity={0.7} filter={`url(#${id("blur2")})`} />
          <rect x={392} y={258} width={30} height={16} rx={3} fill="#2c3445" stroke={accent} strokeWidth={1} opacity={0.8} />
          <rect x={170} y={262} width={22} height={34} rx={3} fill="#2c3445" stroke={C.violet} strokeWidth={1} opacity={0.8} />
        </g>
        <path d="M146 300 C146 146 222 86 300 86 C378 86 454 146 454 300 L454 382 C454 470 394 540 300 544 C206 540 146 470 146 382 Z" fill={url("glass")} opacity={0.8} />
        <path d="M146 300 C146 146 222 86 300 86 C378 86 454 146 454 300 L454 382 C454 470 394 540 300 544 C206 540 146 470 146 382 Z" fill={url("mesh")} />
        {/* Specular rim on the shell */}
        <path d="M170 236 C184 160 236 110 300 104" fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round" opacity={0.45} />

        {/* Ears: audio sensor modules */}
        <g>
          <rect x={124} y={316} width={36} height={90} rx={17} fill={url("metalV")} />
          <rect x={132} y={330} width={20} height={62} rx={10} fill="#141923" />
          <circle cx={142} cy={361} r={5} fill={accent} opacity={glow} />
        </g>
        <g>
          <rect x={440} y={316} width={36} height={90} rx={17} fill={url("metalV")} />
          <rect x={448} y={330} width={20} height={62} rx={10} fill="#141923" />
          <circle cx={458} cy={361} r={5} fill={accent} opacity={glow} />
        </g>

        {/* Face: synthetic skin mask with a visible seam to the shell */}
        <path d="M188 268 C190 186 240 150 300 150 C360 150 410 186 412 268 L412 370 C412 452 364 512 300 516 C236 512 188 452 188 370 Z" fill={url("skin")} />
        <path d="M188 268 C190 186 240 150 300 150 C360 150 410 186 412 268 L412 370 C412 452 364 512 300 516 C236 512 188 452 188 370 Z" fill="none" stroke="#2a303c" strokeWidth={3} opacity={0.85} />
        <path d="M188 268 C190 186 240 150 300 150 C360 150 410 186 412 268 L412 370 C412 452 364 512 300 516 C236 512 188 452 188 370 Z" fill="none" stroke={accent} strokeWidth={1.2} opacity={0.45 * glow} transform="translate(0 2)" />
        {/* Face shading: temples, under-cheekbone, jaw */}
        <path d="M188 300 C196 380 214 440 248 486" fill="none" stroke="#8c6e62" strokeWidth={16} opacity={0.13} filter={`url(#${id("blur6")})`} />
        <path d="M412 300 C404 380 386 440 352 486" fill="none" stroke="#7a5d53" strokeWidth={20} opacity={0.2} filter={`url(#${id("blur6")})`} />
        <path d="M222 410 C244 434 264 440 286 438" fill="none" stroke="#9b7a6d" strokeWidth={10} opacity={0.12} filter={`url(#${id("blur6")})`} />
        {/* Forehead highlight */}
        <ellipse cx={270} cy={228} rx={70} ry={34} fill="#ffffff" opacity={0.25} filter={`url(#${id("blur6")})`} />
        {/* Panel lines across the skin: it is a machine after all */}
        <path d="M300 150 L300 196" stroke="#a7887a" strokeWidth={1.5} opacity={0.7} />
        <path d="M206 448 C236 482 266 498 300 502 C334 498 364 482 394 448" fill="none" stroke="#a7887a" strokeWidth={1.5} opacity={0.7} />
        <path d="M398 290 L382 300 L382 336" fill="none" stroke="#a7887a" strokeWidth={1.5} opacity={0.6} />

        {/* Brows */}
        <path d="M206 308 Q242 290 280 302" fill="none" stroke="#4a3a37" strokeWidth={7} strokeLinecap="round" opacity={0.85} />
        <path d="M320 302 Q358 290 394 308" fill="none" stroke="#4a3a37" strokeWidth={7} strokeLinecap="round" opacity={0.85} />

        {eye(244, "l")}
        {eye(356, "r")}

        {/* Nose: bridge highlight + soft shadow */}
        <path d="M296 360 C292 392 288 410 280 422" fill="none" stroke="#a7887a" strokeWidth={3.5} strokeLinecap="round" opacity={0.8} />
        <path d="M282 426 C292 432 308 432 318 426" fill="none" stroke="#9b7a6d" strokeWidth={3} strokeLinecap="round" />
        <path d="M306 366 L310 410" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" opacity={0.35} />
        <ellipse cx={300} cy={436} rx={26} ry={6} fill="#7a5d53" opacity={0.15} filter={`url(#${id("blur2")})`} />

        {/* Mouth */}
        <g transform="translate(300 468)">
          <path d={`M-44 0 Q0 ${smile + 6 + open * 18} 44 0`} fill="#1f1418" opacity={open > 0.05 ? 1 : 0} />
          {open > 0.35 ? <rect x={-22} y={1} width={44} height={5} rx={2} fill="#e9e6e2" opacity={0.85} /> : null}
          <path d={`M-46 0 Q-23 -11 0 -6 Q23 -11 46 0 Q23 ${-2 + open * 4} 0 ${-1 + open * 4} Q-23 ${-2 + open * 4} -46 0 Z`} fill={url("lip")} />
          <path d={`M-46 0 Q0 ${smile + 13 + open * 20} 46 0 Q0 ${smile + 4 + open * 18} -46 0 Z`} fill={url("lip")} />
          <path d={`M-18 ${smile + 9 + open * 18} Q0 ${smile + 12 + open * 19} 18 ${smile + 9 + open * 18}`} fill="none" stroke="#ffffff" strokeWidth={2.5} opacity={0.3} strokeLinecap="round" />
        </g>
        <ellipse cx={300} cy={506} rx={30} ry={7} fill="#ffffff" opacity={0.22} filter={`url(#${id("blur2")})`} />
      </g>
    </svg>
  );
};
