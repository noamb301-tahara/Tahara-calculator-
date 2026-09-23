# Shorts Studio

מערכת שמקבלת סרטוני Shorts של הדרכות מסך (איפה ללחוץ ומה לעשות) **ובונה מהם מחדש** הדרכה בעברית:
Short חדש 9:16 עם ממשק דמו מעוצב (לא צילום המסך המקורי), קריינות, כתוביות, מדריך כתוב ו-SEO.

```
input/short-demo.mp4
   └─► output/<project-id>/
         source-analysis.json  tutorial.json  script-he.txt  voice.mp3
         subtitles.srt  subtitles.json  guide.md  seo.json  final-short.mp4
```

## התחלה מהירה

דרישות: Node ≥ 20, pnpm, FFmpeg, Tesseract (`eng`,`heb`), ו-Chromium (Remotion מוריד לבד, או `STUDIO_BROWSER_EXECUTABLE`).
אופציונלי: `espeak-ng` (קריינות עברית מקומית לפיתוח), `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (קריינות אמיתית), `ANTHROPIC_API_KEY` (Claude לניתוח ולעברית).

```bash
pnpm install
cp .env.example .env            # מפתחות רק כאן — לעולם לא בקוד

pnpm demo:render                # הדרכת דמו ידנית → output/demo-2fa/final-short.mp4 (בלי AI)
pnpm demo:source                # סרטון מקור סינתטי (סרגל צד, דיאלוג) → input/short-demo.mp4
pnpm demo:source brightdesk     # מקור שני (ניווט עליון, לשוניות, מתג) → input/short-brightdesk.mp4
pnpm doctor                     # אילו מפתחות/כלים/ספקים ישמשו בהרצה (בלי להדפיס ערכי מפתחות)
pnpm accuracy                   # השוואת השלבים שזוהו מול *.truth.json (זמן, תווית, סוג, רכיב יעד)
pnpm e2e                        # מקור → ניתוח → שלבים → Demo UI → עברית → קול → רינדור
pnpm batch                      # כל הסרטונים בתיקיית input/
pnpm admin:build && pnpm --filter @studio/admin start   # לוח בקרה: http://localhost:3100
pnpm test && pnpm typecheck
```

CLI מלא (`pnpm studio …`):

| פקודה | מה עושה |
|---|---|
| `run <video\|id> [--from stage] [--until stage] [--force[=a,b]] [--auto-approve] [--preset dark] [--fidelity simplified]` | מריץ את הצינור (עם cache) |
| `batch <dir> [--concurrency 2]` | עיבוד תור, כשל בסרטון אחד לא עוצר אחרים |
| `demo` | פרויקט ידני מ-`data/templates/demo-2fa` |
| `list`, `status <id>`, `approve <id>` | ניהול |
| `academy` | מבנה קורס/מצגת/ספר מכל ההדרכות |

שלבים: `ingest → transcribe → analyze_frames → detect_actions → extract_tutorial → reconstruct_screens → write_script → voice → subtitles → plan_render → guide → seo → render`.

## איך זה עובד (בקצרה)

1. **ניתוח** — FFmpeg (מטא-דאטה, אודיו, scene detection, זרם תנועה ברזולוציה נמוכה), מעקב סמן ושינויי UI, דגימת פריימים חכמה, OCR (כולל מעבר ייעודי לכפתורים צבעוניים), תמלול.
2. **זיהוי פעולות** — שילוב אותות: משפט בקריינות ("click Team…"), התאמת תווית ב-OCR, מיקום/עצירת סמן, שינוי מסך אחרי → `confidence`.
3. **tutorial.json** — שלבים עם מה/איפה/מה רואים אחרי, התווית האמיתית (`required_real_label`), ביטחון, `NEEDS REVIEW`.
4. **שחזור מסכים** — `ScreenDefinition` JSON לכל מצב (סרגל צד, טבלאות, מדדים, דיאלוגים, dropdown, toast) במצב FAITHFUL; שמות אנשים/עסקים/מספרים/אימיילים/מזהים מוחלפים בנתוני דמה.
5. **תסריט עברי** — הוראות קצרות בציווי רבים, התווית האמיתית במירכאות, 3 hooks כנים.
6. **קול** — ElevenLabs (עם תזמון תווים לכתוביות), cache לפי hash של הטקסט, retries; espeak-ng/שקט כשאין מפתח.
7. **Remotion** — INTRO → HOOK → STEP… → SUMMARY → CTA; כל פעולה מונעת JSON (`cursor_move`, `cursor_click`, `click_pulse`, `highlight`, `spotlight`, `zoom_in/out`, `open_menu`, `open_dialog`, `select_option`, `type_text`, `toggle`, `scroll`, `before_after`, `success_state`, `warning_callout`, …).

פרטים: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). הגדרות: [config/studio.config.json](config/studio.config.json) (ברירות מחדל ב-`packages/shared/src/config.ts`).

## סגנונות ומצבי נאמנות

* Presets: `clean`, `illustrated`, `modern-saas` (ברירת מחדל), `dark` — מחליפים עיצוב בלי לגעת במבנה ההדרכה.
* Fidelity: `faithful` (ברירת מחדל לסרטוני "איפה ללחוץ"), `simplified`, `conceptual`.

## פרטיות

בדיקה כפולה: (1) לפני הרינדור — כל מחרוזת רגישה שנמצאה במקור ונשארה במסכים מוחלפת, ואם משהו נשאר ההרצה נעצרת; (2) אחרי הרינדור — OCR על הסרטון המוגמר, ואם מופיע מידע מהמקור הקובץ נדחה (`final-short.REJECTED.mp4`).

אימיילים, טלפונים, שמות, מזהי חשבון, כתובות, כרטיסי אשראי, מפתחות API, סיסמאות וטוקנים מזוהים ומוחלפים בנתוני דמה עקביים (`example.com`, `(555) 01x-xxxx`) לפני שהם מגיעים ל-Demo UI; ב-`source-analysis.json` הם מושחרים (`[email]`).

## רישוי

Remotion דורש רישיון חברה לארגונים מעל גודל מסוים — ראו https://remotion.dev/license.
