# DotDay

DotDay is a minimal Windows desktop widget for habits, events, and quick notes.

## Run

```bash
npm install
npm run dev
```

## Data

Data is stored locally in Electron's app data directory. On Windows this is typically:

```text
%APPDATA%\DotDay\dotday-data.json
```

The renderer does not access `fs` directly. It reads and writes through the secure preload API.
