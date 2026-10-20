# Scripture Captions (MVP)

Live captions of what a speaker says, plus automatic Bible verse suggestions, shown on stream through vMix.

## Run it

1. Install **Node.js** (LTS) from https://nodejs.org (one time).
2. Double-click **start.bat** (Windows) or run `./start.sh` (Mac/Linux).
3. The operator page opens at **http://localhost:3000/**. Use **Google Chrome or Microsoft Edge**.
4. Click **Start listening** and allow the microphone.

## Add it to vMix

1. **Add Input → Web Browser**
2. URL: `http://localhost:3000/output`
3. Width **1920**, Height **1080** (match your vMix project)
4. Put the input on a layer above your camera. The background is transparent.

If vMix runs on a different PC, open `http://<operator-pc-address>:3000/output` instead (the address is printed when the server starts). Both PCs must be on the same network.

## How it works

- **Captions**: the operator page uses the browser's built-in speech recognition and sends text to the overlay as the speaker talks. Pick the speaker's accent (English-Nigeria is the default). It needs an internet connection.
- **Spoken references** ("John three sixteen", "first Corinthians thirteen verses four to seven", "Romans eight twenty eight") are found automatically and, by default, shown on stream straight away in your default version.
- **Paraphrases** ("God loved the world so much that he gave his only son") are matched to likely verses. They appear as suggestions on the operator page with a match percentage and a ★ on the version whose wording is closest to what was said. Press **Show on stream** to put one up. Turning on *auto-show very confident paraphrase matches* will show 80%+ matches without a click; it is off by default so a wrong verse never goes out by accident.
- **Look up a verse** by typing it (for example `Psalm 23`) on the operator page.
- **Hide scripture on stream** is always one click, and the card also hides itself after the number of seconds you set.
- No microphone? Type a sentence into the test box to see the whole flow.

## Versions included

World English Bible (WEB), King James (KJV), American Standard (ASV), Bible in Basic English (BBE), Young's Literal (YLT) and Darby. All are public domain. Modern copyrighted versions (NIV, ESV, NLT and others) are not included; they need a licence or a licensed API.

Bible text comes from https://github.com/thiagobodruk/bible (MIT licence), cleaned by `tools/build-data.py`.

## Known limits of this first version

- Browser speech recognition is decent but not perfect with strong accents, background music or a distant mic. A paid streaming service (Deepgram, AssemblyAI, Azure) is the natural upgrade and the rest of the app would not change.
- Paraphrase matching works on single verses and wording. A loose idea with no distinctive words may not be found, and very famous verses are matched best.
- Captions are not fact-checked in this version (church mode only).

## Tests

`node --test test/detect.test.js`
