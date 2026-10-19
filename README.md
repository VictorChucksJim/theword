# TheWord — Scripture Captions

This repository is intended for the Scripture Captions MVP: live browser captions, Bible verse detection and a transparent vMix overlay.

> **Important: this repository is not yet a runnable copy of the app.** The files currently committed are setup notes and import-status markers; the original application files and Bible dataset from `scripture-captions.zip` have not been uploaded in full. Do not run `npm start` or `npm test` until the import is complete.

## Intended MVP features

- Live browser-based speech recognition captions
- Spoken Bible reference detection and verse lookup
- Paraphrase suggestions for operator review
- Transparent vMix browser overlay

The supplied ZIP includes a Node.js application and a Bible dataset. Before distributing the dataset, verify upstream attribution and licensing. Do not commit `.env` files, API credentials, private keys, or personal recordings.

## Complete the import

From a computer with the ZIP extracted and Git installed, copy the original project files into this repository (replace the temporary `src/scripture.js` and `test/detect.test.js` markers with the original ZIP contents), review `git status`, then commit and push the full project. Include the `data/bible.json` file only after confirming its distribution rights.
