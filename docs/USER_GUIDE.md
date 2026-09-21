# IELTS Format — User guide

Turn IELTS paper **photos** into an interactive exam (answer boxes, highlights, maps kept as images).

Works on **Windows** and **Debian/Ubuntu** Linux — one command, like Jupyter Notebook.

---

## Requirements

- **Node.js 20+** ([nodejs.org](https://nodejs.org/) or `nvm install 20`)
- A free **Gemini API key** (you can add it in the app)

---

## Install (once)

```bash
cd "IELTS Format"
npm install
```

On Windows, open the folder in Command Prompt or PowerShell and run the same `npm install`.

---

## Start (every study session)

**Linux / macOS**

```bash
npm start
# or: ./start.sh
```

**Windows**

```bat
npm start
rem or double-click start.bat
```

The app builds the UI if needed, starts a local server, and opens your browser at **http://127.0.0.1:8888/**.

Stop with `Ctrl+C` in the terminal.

---

## Add your API key (in the app)

If you have not set a key yet, a **Setup** panel opens automatically:

1. Click **Open AI Studio** (or go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
2. Sign in with Google → **Create API key** → copy it
3. Paste it into the panel → **Save key**
4. Wait until the status shows **API OK**

You can open the same panel anytime with the top-bar **API key** button, or via Settings → **Change API key…**.

(The key is stored in the project `.env` file on your machine only.)

---

## Use the app

1. Drop or paste exam screenshots on the left
2. Click **Convert to exam** (can take 1–3 minutes; watch the status log)
3. Type answers in the boxed blanks; select text to highlight
4. Paste an answer key on the right → **Check answers**
   - Supports glued keys (`14 A15 C`) and any-order groups (`38-40 B, C, F`)
   - Lines like `Question 13` are treated as headers, not answers

**Reading papers**

- Passage on the left, questions on the right (drag the divider to resize)
- Toolbar: **Highlight** (default) or **Copy** — copy mode keeps existing highlights
- **Ctrl+Z** / **Ctrl+Y** undo/redo highlights (when not typing in a field)
- Passage title, subtitle, illustration + caption, and footnotes are kept when the model finds them
- “Which paragraph contains the following information?” uses paragraph-letter matching on the questions side (not heading drop-zones in the passage)
- Under the exam: **Paragraph notes** + **Export paragraph notes**

**Sample Listening** / **Sample Reading** work offline without the API.

---

## Proxy (optional)

If Gemini needs a local HTTP proxy, put it in `.env` (not only the terminal):

```env
HTTPS_PROXY=http://127.0.0.1:2080
HTTP_PROXY=http://127.0.0.1:2080
```

Then restart with `npm start`. Exporting proxy only in the shell is easy to forget.

### HTTP 403 from Gemini

Often means the proxy stripped the auth header, or the key is restricted. The app now also sends the key as `?key=` / `x-goog-api-key`. Still seeing 403:

1. Confirm proxy lines are in `.env` and restart
2. Create a **new** key at [AI Studio](https://aistudio.google.com/apikey) (no IP/referrer restrictions)
3. Paste it via the in-app **API key** panel

---

## Developer mode (two terminals)

For live UI reloading while coding:

```bash
npm run bridge   # API (default still works on BRIDGE_PORT / 8787 in watch mode)
npm run web      # Vite UI on http://127.0.0.1:5173/  (proxies /api → bridge)
```

---

## Troubleshooting

| Symptom | What to try |
|---|---|
| Setup panel / **API DOWN** | Use **API key** and paste a fresh Gemini key |
| Port in use | Set `IELTS_PORT=8890` in `.env` |
| Convert fails with high demand | Wait — the bridge retries / switches models automatically |
| Empty response from vision API | Retry convert; bridge treats blank Gemini STOP as a flake and switches backup |
| Matching info shows “Paragraph A–J” only | Re-convert after updating — that task is not matching headings |
| Schema validation / `questionNumber` NaN | Restart bridge and re-convert — invalid blanks are sanitized; flow-charts use notes rows |
| Samples work, convert fails | Check **API OK** after Recheck; confirm proxy if needed |

---

## Privacy

Screenshots and your API key stay on your computer. Convert sends images to Google’s Gemini API over the network when you convert.
