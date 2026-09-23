import { detectAppChrome } from "../packages/frame-analysis/src/chrome";
const dirs = { taskly: "data/projects/short-demo-3da48825/work/frames", bright: "data/projects/short-brightdesk-40d186c4/work/frames" };
const { readdirSync } = await import("node:fs");
for (const [k, d] of Object.entries(dirs)) {
  const files = readdirSync(d).sort();
  for (const f of [files[1], files[Math.floor(files.length / 2)], files[files.length - 2]]) console.log(k, f, JSON.stringify(await detectAppChrome(`${d}/${f}`, 1080, 1920)));
}
