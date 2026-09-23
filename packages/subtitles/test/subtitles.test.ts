import { describe, expect, it } from "vitest";
import { buildSubtitles, packCues, splitIntoPhrases, toSrt } from "../src/index";

const opts = { maxCharsPerLine: 26, maxLines: 2, minCueSec: 0.9, maxCueSec: 3.2 };

describe("subtitles", () => {
  it("splits by meaning (punctuation) before length", () => {
    const p = splitIntoPhrases("לחצו על 'Settings' בתפריט השמאלי. נפתח מסך ההגדרות.", 26);
    expect(p.every((x) => x.length <= 26)).toBe(true);
    expect(p.at(-1)).toBe("נפתח מסך ההגדרות.");
  });
  it("never produces more than two lines per cue", () => {
    const cues = packCues(splitIntoPhrases("אחת שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר אחת עשרה שתים עשרה שלוש עשרה ארבע עשרה", 20), 20, 2);
    expect(cues.every((c) => c.length <= 2)).toBe(true);
  });
  it("times cues inside the spoken segment, ordered, non-overlapping", () => {
    const track = buildSubtitles(
      [
        { segmentId: "a", text: "לחצו על 'Team' בתפריט הצד משמאל. נפתח העמוד 'Team'.", start: 1, duration: 4 },
        { segmentId: "b", text: "לחצו על 'Invite member' בפינה הימנית העליונה.", start: 6, duration: 3 },
      ],
      opts,
    );
    expect(track.direction).toBe("rtl");
    expect(track.cues[0]!.start).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < track.cues.length; i++) expect(track.cues[i]!.start).toBeGreaterThanOrEqual(track.cues[i - 1]!.end);
    expect(track.cues.filter((c) => c.segmentId === "a").every((c) => c.end <= 5.01 + opts.minCueSec)).toBe(true);
  });
  it("uses TTS character alignment when available", () => {
    const text = "שלום עולם. זה מבחן.";
    const chars = [...text];
    const track = buildSubtitles([{ segmentId: "a", text, start: 10, duration: 5, alignment: { chars, starts: chars.map((_, i) => i * 0.1), ends: chars.map((_, i) => i * 0.1 + 0.1) } }], { ...opts, maxCharsPerLine: 10, maxLines: 1 });
    expect(track.cues[0]!.start).toBeCloseTo(10, 1);
    expect(track.cues.at(-1)!.end).toBeLessThan(12.5);
  });
  it("writes valid SRT with RTL embedding", () => {
    const srt = toSrt(buildSubtitles([{ segmentId: "a", text: "שלום עולם.", start: 0, duration: 1.5 }], opts));
    expect(srt).toMatch(/^1\n00:00:00,000 --> 00:00:01,500\n‫שלום עולם.‬\n$/);
  });
});
