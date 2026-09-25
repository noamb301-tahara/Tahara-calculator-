# Shorts Studio: הקשר מלא לפרויקט (קרא לפני כל עבודה)

> הקובץ הזה נכתב כדי שכל שיחת Claude חדשה (גם מקומית במחשב של נועם) תבין מה הפרויקט, מה כבר נבנה, ואיך לעבוד.
> ענף העבודה: `claude/hebrew-shorts-tutorial-system-ru724s`.

## 1. מה הבעלים של הפרויקט רוצה

נועם רוצה מערכת אמיתית שעובדת: לא תוכנית ולא הדגמה. המערכת לוקחת **סרטוני הדרכה קצרים באנגלית** (הקלטות מסך שמראות איפה ללחוץ ומה לעשות), ומייצרת מכל סרטון **תוצר חדש בעברית**:

- סרטון Short חדש בעברית, 1080×1920 ב-30fps.
- קריינות בעברית (ElevenLabs).
- כתוביות בעברית (`subtitles.srt`).
- **ממשק דמו חדש ומעוצב במקום צילום המסך המקורי**, בגישת FAITHFUL STYLIZED RECONSTRUCTION:
  - **נשאר כמו במקור:** השמות האמיתיים של הכפתורים והתפריטים (באנגלית, כמו שהמשתמש יראה אותם), המבנה, סדר הפעולות, ומה שקורה אחרי כל לחיצה.
  - **משתנה:** צבעים, גופנים, ושמות אנשים, מספרים ופרטים אישיים, שמוחלפים בנתוני דמה.
- מדריך כתוב שלב אחרי שלב (`guide.md`).
- חומר לקורס או מצגת (Academy).
- תוכן SEO (`seo.json`), ובסיס לסוכן SEO עתידי.

**הכיוון תמיד: מקור באנגלית ← כל התוצרים בעברית.** השמות האמיתיים של הכפתורים נשארים באנגלית בתוך מירכאות, למשל: `לחצו על 'Invite member'`.

**בדיקת הקבלה:** `short-demo.mp4` מייצר את הקבצים `source-analysis.json`, `tutorial.json`, `script-he.txt`, `voice.mp3`, `subtitles.srt`, `guide.md`, `seo.json` ו-`final-short.mp4`.

## 2. כללי עבודה עם נועם (חובה)

- **לדבר רק בעברית** ולהראות לו כל שלב שעושים.
- לא לשאול על החלטות קטנות: לבצע. לשאול רק כשזו באמת החלטה שלו.
- **לפני כל התקנה במחשב שלו לבקש אישור.**
- **מפתחות (API keys):** רק בקובץ `.env`, שנועם ממלא בעצמו. אסור לבקש אותם בצ'אט, להדפיס אותם או לשמור אותם בקוד.
- לא לטעון שמשהו עובד בלי לבדוק: להריץ typecheck, בדיקות ורינדור.
- לדווח בקצרה על כל שלב: מה נבנה, מה נבדק, מה לא עובד, מה הצעד הבא.
- לא להגזים בבנייה. העדיפות היא צינור ה-Shorts.
- commit ו-push רק לענף `claude/hebrew-shorts-tutorial-system-ru724s`. לא לפתוח PR אלא אם נועם מבקש.

## 3. המשימה הנוכחית (במחשב של נועם)

הסרטונים של הקורס נמצאים בתיקייה:
```
I:\קורס קידום בגוגל ובבינה מלאכותית
```
הסרטונים באנגלית, וייתכן שיש בהם גם קריינות וגם כתוביות. נועם רוצה שכולם יעברו לעברית.

1. לבדוק שמותקנים Node 20 ומעלה, pnpm, FFmpeg ו-Tesseract עם עברית ואנגלית. להתקין את מה שחסר עם winget, באישור נועם:
   `winget install OpenJS.NodeJS.LTS`, `winget install Gyan.FFmpeg`, `winget install UB-Mannheim.TesseractOCR` ו-`npm i -g pnpm`.
   ב-Tesseract צריך לסמן Hebrew בזמן ההתקנה ולהוסיף את `C:\Program Files\Tesseract-OCR` ל-PATH.
2. `pnpm install`, ואחר כך `pnpm doctor`, שמראה מה חסר בלי להדפיס מפתחות.
3. לבקש מנועם למלא את `.env`: `ELEVENLABS_API_KEY` ו-`ELEVENLABS_VOICE_ID` (לתמלול ולקול עברי), ו-`ANTHROPIC_API_KEY` (לשיפור הניתוח והעברית).
4. להריץ קודם **סרטון אחד**: `pnpm studio run "<נתיב לסרטון>" --auto-approve`. אחר כך להראות לנועם את התוצאה (`output\<id>\final-short.mp4` ופריים לדוגמה).
5. אם התוצאה טובה, להריץ את כל התיקייה, כולל תתי־תיקיות: `pnpm studio batch "I:\קורס קידום בגוגל ובבינה מלאכותית" --concurrency 1`
   - **שים לב:** `pnpm batch` בלי `studio` רץ רק על התיקייה `input`.
6. **חשוב:** המערכת נבנתה לסרטוני הדרכה קצרים (דקה עד שתיים). אם שיעורי הקורס ארוכים (הרצאות של 10 דקות ומעלה), צריך לבדוק איכות על סרטון אחד ולהתייעץ עם נועם לפני שמריצים הכול. ייתכן שיהיה צורך לחתוך את השיעורים לקטעים.

## 4. מה כבר נבנה (עובד ונבדק)

מונורפו pnpm ב-TypeScript. הקבצים הם `src/*.ts` ורצים עם tsx. הכלים: vitest, zod, React 19, Remotion 4, Next.js 16 (לוח בקרה), FFmpeg, Tesseract ו-Playwright/Chromium.

**שלבי הצינור** (`packages/pipeline/src/stages.ts`), עם cache לפי hash של הקלט:
`ingest → transcribe → analyze_frames → detect_actions → extract_tutorial → reconstruct_screens → write_script → voice → subtitles → plan_render → guide → seo → render`

| חבילה | תפקיד |
|---|---|
| `video-ingestion` | ffprobe, אודיו, זיהוי סצנות, זרם תנועה, תמונות ממוזערות |
| `transcription` | תמלול: קובץ sidecar, ElevenLabs Scribe, whisper מקומי, או בלי תמלול |
| `frame-analysis` | מעקב סמן, דגימת פריימים, OCR (כולל כפתורים צבעוניים), זיהוי סרגל צד וסרגל עליון מהפיקסלים, **זיהוי כתוביות צרובות על המסך** (`captions.ts`), ובדיקת פרטיות של הסרטון הסופי (`verify.ts`) |
| `tutorial-extractor` | זיהוי פעולות משילוב אותות (קריינות, OCR, סמן, שינוי במסך) עם ציון ביטחון, ובניית `tutorial.json`. כשאין קריינות, הכתוביות משמשות כתמלול (`narration.ts`) |
| `screen-reconstruction` | בניית `ScreenDefinition` JSON לכל מצב מסך: סרגל צד, ניווט עליון, לשוניות, טבלאות, דיאלוגים, מתגים והודעות. שילוב טקסט מכמה פריימים של אותו מצב, והחלפת נתונים אישיים בנתוני דמה |
| `demo-data` | זיהוי מידע רגיש והחלפה דטרמיניסטית בנתוני דמה |
| `script-writer` | תסריט בעברית: ציווי רבים, תווית אמיתית במירכאות, מיקום ("בתפריט הצד משמאל"), כיוון מתג נכון (כבו/הפעילו), ו-3 פתיחים (hooks) |
| `voice` | ElevenLabs, ואם אין: espeak-ng או שקט. יש cache לפי hash ו-retries |
| `subtitles`, `guide-generator`, `seo-engine`, `academy`, `llm` | התוצרים הכתובים. Claude רץ דרך `@anthropic-ai/sdk` כשיש מפתח |
| `remotion-scenes`, `apps/renderer` | מנוע Remotion: INTRO, HOOK, השלבים, SUMMARY ו-CTA. כל פעולה מוגדרת ב-JSON (cursor, click, highlight, zoom, dialog, toggle…). 4 סגנונות: `clean`, `illustrated`, `modern-saas`, `dark` |
| `apps/admin` | לוח בקרה ב-Next.js (פורט 3100): פרויקטים, עריכה ואישור של שלבים, תצוגה מקדימה, והרצה מחדש |

**פרטיות, בדיקה כפולה:**
1. לפני הרינדור: כל מחרוזת רגישה מהמקור שנשארה במסכים מוחלפת. אם אי אפשר להחליף אותה, ההרצה נעצרת.
2. אחרי הרינדור: המערכת מריצה OCR על הסרטון המוגמר. אם מופיע בו מידע מהמקור, הקובץ נדחה ונשמר בשם `final-short.REJECTED.mp4`.

**אם נועם ערך את `tutorial.json` בלוח הבקרה**, הקובץ לא נדרס. ניתוח חדש נשמר בנפרד בקובץ `analysis/tutorial-auto.json`.

## 5. פקודות

```
pnpm doctor                     # מה מותקן ומה חסר
pnpm test && pnpm typecheck     # 85 בדיקות אמורות לעבור
pnpm demo:source                # סרטון מקור סינתטי 1: סרגל צד + דיאלוג → input/short-demo.mp4
pnpm demo:source brightdesk     # מקור 2: ניווט עליון, לשוניות, מתג
pnpm demo:source taskly-captions  # מקור 3: מסך מלא, בלי קריינות, רק כתוביות
pnpm e2e                        # בדיקת הקבלה על input/short-demo.mp4
pnpm accuracy                   # השוואת השלבים שזוהו מול *.truth.json
pnpm studio run <video|id> [--from stage] [--until stage] [--force] [--auto-approve] [--preset dark]
pnpm studio batch <dir> [--concurrency 1]
pnpm studio list | status <id> | approve <id> | academy
pnpm admin:build && pnpm --filter @studio/admin start   # http://localhost:3100
```

## 6. מצב נוכחי

- 3 תרחישי בדיקה עוברים מקצה לקצה ומגיעים ל-COMPLETE: Taskly, Brightdesk, וכתוביות בלבד.
- `pnpm accuracy`: 14 מתוך 14 פעולות זוהו נכון, בלי שלבים מיותרים.
- 85 בדיקות עוברות, ו-typecheck נקי.
- **תיקונים ל-Windows** (commit `0c29253`):
  - בדיקת הכלים משתמשת ב-`where` במקום `sh`.
  - batch נכנס גם לתתי־תיקיות.
  - שמות קבצים בעברית מקבלים מזהה קריא, למשל `video-3-<hash>`.
- **עוד לא נבדק על Windows אמיתי**, אז צפויות תקלות קטנות. לתקן, להריץ שוב את הבדיקות, ולעשות commit.

## 7. מגבלות ידועות

- **המפתחות של ElevenLabs ו-Anthropic** נבדקו עד היום רק עם mock, כי בסביבת הענן לא היו מפתחות ו-ElevenLabs היה חסום. במחשב של נועם זה אמור לעבוד. בהרצה הראשונה צריך לוודא שנוצר `voice.mp3` אמיתי.
- **בלי תמלול** (אין מפתח ElevenLabs ואין whisper), קריינות באנגלית לא תיקלט, ורק כתוביות על המסך ישמשו להבנת השלבים.
- **זיהוי ההוראות מהקריינות והכתוביות עובד באנגלית בלבד** ("click", "tap", "select", "type", "turn off"…). זה מתאים לקורס הנוכחי, שהוא באנגלית.
- **סרטונים ארוכים או שאינם הדרכת מסך** (למשל מצלמה על מרצה) לא מתאימים לשחזור ממשק. צריך לזהות אותם ולדווח לנועם.

## 8. מסמכים נוספים

- `README.md`: מדריך קצר בעברית.
- `docs/ARCHITECTURE.md`: הארכיטקטורה המלאה.
- `config/studio.config.json`: ההגדרות. ברירות המחדל נמצאות ב-`packages/shared/src/config.ts`.
