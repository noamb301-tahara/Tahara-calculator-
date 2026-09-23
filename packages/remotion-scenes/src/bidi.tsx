import React from "react";

/**
 * Hebrew text frequently embeds real English UI labels ("לחצו על 'Settings'").
 * Wrap Latin runs (with their quotes) in <bdi dir="ltr"> so punctuation does
 * not jump around under the RTL bidi algorithm.
 */
const LATIN_RUN = /(['"״“”]?[A-Za-z0-9@][A-Za-z0-9@._:/&+#%-]*(?:\s+[A-Za-z0-9@][A-Za-z0-9@._:/&+#%-]*)*['"״“”]?)/g;

export function splitBidi(text: string): { text: string; ltr: boolean }[] {
  const parts: { text: string; ltr: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const idx = m.index ?? 0;
    const run = m[0];
    // Pure numbers inside Hebrew are fine without isolation.
    if (!/[A-Za-z]/.test(run)) continue;
    if (idx > last) parts.push({ text: text.slice(last, idx), ltr: false });
    parts.push({ text: run, ltr: true });
    last = idx + run.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), ltr: false });
  return parts;
}

export const BidiText: React.FC<{ text: string; ltrStyle?: React.CSSProperties }> = ({ text, ltrStyle }) => (
  <>
    {splitBidi(text).map((p, i) =>
      p.ltr ? (
        <bdi key={i} dir="ltr" style={ltrStyle}>
          {p.text}
        </bdi>
      ) : (
        <React.Fragment key={i}>{p.text}</React.Fragment>
      ),
    )}
  </>
);
