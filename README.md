# Scripture Captions

Real-time captions with Bible verse detection and a transparent overlay for vMix.

## Requirements

- Node.js 18 or newer
- Google Chrome or Microsoft Edge for browser speech recognition
- Internet connection for browser speech recognition

## Run locally

1. Install dependencies (this MVP currently uses Node.js built-ins only):
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000/` and allow microphone access.
4. Run automated tests with:
   ```bash
   npm test
   ```

On Windows, `start.bat` is also provided. On macOS/Linux, use `./start.sh`.

## vMix overlay

In vMix, add a **Web Browser** input pointing to `http://localhost:3000/output`, using 1920 × 1080 or your project dimensions. If vMix runs on another computer, use the operator computer's LAN IP address and ensure both devices are on the same trusted network.

## Features

- Live browser-based speech recognition captions
- Explicit Bible reference detection and verse lookup
- Suggestions for likely verse paraphrases, with operator confirmation
- Optional transparent overlay suitable for vMix
- Included public-domain Bible translations: World English Bible (WEB), King James Version (KJV), American Standard Version (ASV), Bible in Basic English (BBE), Young's Literal Translation (YLT), and Darby

## Limitations

- Browser speech recognition quality and availability depend on the browser, microphone, network, language and accent.
- This version focuses on church/sermon mode; it does not fact-check meeting claims.
- Do not use it to capture private conversations without appropriate consent.

## Bible data attribution and licensing

The project README supplied with the source ZIP attributes the Bible dataset to [thiagobodruk/bible](https://github.com/thiagobodruk/bible) and states that the source project is MIT-licensed and that the included translation texts are public domain. Review the upstream license and verify the status of each included text before redistribution.

## Development

```bash
npm test
```

See `src/scripture.js`, `server.js`, and `public/` for detection, server and UI code respectively.
