# Architecture

```
SOURCE SHORT ─► ingest ─► transcribe ─► analyze_frames ─► detect_actions ─► extract_tutorial
                                                                               │  (NEEDS_REVIEW gate, optional)
                   ┌───────────────────────────────────────────────────────────┘
                   ▼
        reconstruct_screens ─► write_script ─► voice ─► subtitles ─► plan_render ─► guide ─► seo ─► render
                                                                                                    │
                                                              output/<project-id>/final-short.mp4 ◄─┘
```

Every stage is a pure-ish function over files in `data/projects/<id>/`. The orchestrator
(`packages/pipeline`) hashes each stage's input files + config slice + stage version;
unchanged inputs ⇒ the stage is skipped (`cached`). Re-running after a review edit only
re-executes what depends on `tutorial.json`.

## Packages

| package | role |
|---|---|
| `shared` | zod schemas (Project, Tutorial, ScreenDefinition, VisualAction, RenderPlan, …), config, state machine, file naming, file store, logger |
| `video-ingestion` | ffprobe, audio, scene detection, low-res motion stream, thumbnails |
| `transcription` | sidecar / ElevenLabs Scribe / whisper CLI; sentence segmentation; language detection |
| `frame-analysis` | cursor tracking & UI-change detection, smart frame sampling, Tesseract OCR (+ filled-button pass), layout heuristics, vision hook |
| `tutorial-extractor` | narration cue parsing, multi-signal action fusion with confidence, tutorial builder |
| `demo-data` | PII detection, deterministic dummy data, redaction |
| `screen-reconstruction` | OCR frames → ScreenDefinitions (faithful / simplified / conceptual) |
| `script-writer` | Hebrew narration + hooks, what/where/after checks |
| `voice` | ElevenLabs (with timestamps) / espeak-ng / silent, hash cache, retries, aligned track |
| `subtitles` | Hebrew cues (≤2 lines), SRT + JSON |
| `remotion-scenes` | Demo UI design system, ScreenRenderer, VisualAction engine, choreographer, compositions, timeline/plan |
| `guide-generator` | Markdown guide with front matter |
| `seo-engine` | seo.json (no invented metrics) + future SEO agent interfaces |
| `llm` | optional Claude: vision, tutorial refinement, Hebrew script, translation draft |
| `academy` | clustering, duplicates, gaps, course/presentation outlines |
| `pipeline` | orchestration, caching, state, batch |
| `apps/renderer` | Remotion root + Node render API |
| `apps/admin` | Next.js dashboard + review UI |

## Key design decisions

* **Rebuild, don't translate.** The source is analysed into `tutorial.json`; the video is
  re-created from `screens.json` (ScreenDefinition JSON) with the style preset.
* **Teaching accuracy over visual similarity.** `required_real_label` is preserved verbatim
  everywhere (callouts, UI, guide). OCR variants of a target label are canonicalised to it.
* **Deterministic frames.** The VisualAction interpreter is pure (`computeRuntime(t)`), and
  element positions are measured from hidden "probe" renders of the exact UI state each
  targeted action needs — any frame renders identically regardless of render order.
* **No single signal is trusted.** Actions get a confidence from narration + OCR match +
  cursor position/stop + UI change + state change.
* **Humans own `tutorial.json`** once they edit/approve steps; re-analysis writes to
  `analysis/tutorial-auto.json` instead.
* **Offline first.** Everything runs without API keys (Tesseract, espeak-ng, heuristics);
  Claude and ElevenLabs improve quality when configured.
