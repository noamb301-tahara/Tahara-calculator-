/**
 * Render the Adam character preview.
 *   tsx scripts/render-character.ts <outDir> [--video]
 */
import { resolve } from "node:path";
import { renderCompositionById } from "@studio/renderer";

const [outDir = "output/character", flag] = process.argv.slice(2);
const props = {};
for (const f of [15, 45, 100]) console.log(await renderCompositionById("AdamIntro", props, resolve(outDir, `adam-${f}.png`), f));
if (flag === "--video") console.log(await renderCompositionById("AdamIntro", props, resolve(outDir, "adam-intro.mp4")));
