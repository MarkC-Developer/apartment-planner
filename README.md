# Apartment Planner — Tauri Desktop App

A local-first spatial and process planning tool. Your data lives as `.json` files on your own filesystem — no cloud, no localStorage, no browser dependency.

## Prerequisites

### 1. Install Rust
```bash
# Windows: Download and run from https://rustup.rs
# macOS/Linux:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
After installing, restart your terminal and verify:
```bash
rustc --version
cargo --version
```

### 2. Install Node.js (v18+)
Download from https://nodejs.org or use a version manager like nvm.

### 3. System dependencies (Linux only)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### 4. Install Tauri CLI
```bash
npm install -g @tauri-apps/cli@latest
```

## Setup

```bash
cd apartment-planner-tauri
npm install
```

## Development

Run the app in dev mode (hot-reload for frontend, auto-rebuild for Rust):
```bash
npm run tauri dev
```

This will:
1. Start Vite dev server on port 3000
2. Compile the Rust backend
3. Open a native window with your app

First run takes 2-3 minutes (Rust compilation). Subsequent runs are fast.

## Build for Distribution

```bash
npm run tauri build
```

This creates:
- **Windows**: `.msi` installer + `.exe` in `src-tauri/target/release/bundle/`
- **macOS**: `.dmg` + `.app` in `src-tauri/target/release/bundle/`
- **Linux**: `.deb` + `.AppImage` in `src-tauri/target/release/bundle/`

## Architecture

```
apartment-planner-tauri/
├── src/                     # React frontend (unchanged from browser version)
│   ├── main.jsx             # React entry point
│   └── ApartmentPlanner.jsx # Main component (only persistence layer changed)
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   └── lib.rs           # File I/O commands, config management
│   ├── capabilities/        # Permission declarations
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json      # App window config, build settings
├── index.html               # HTML shell
├── package.json             # Node dependencies + scripts
└── vite.config.js           # Vite dev server config
```

## How Data Storage Works

- **Plan files**: Saved as `.json` files wherever you choose on your filesystem
- **App config**: Stored in your OS config directory:
  - Windows: `%APPDATA%/apartment-planner/config.json`
  - macOS: `~/Library/Application Support/apartment-planner/config.json`
  - Linux: `~/.config/apartment-planner/config.json`
- **Config tracks**: Recent files (up to 20), last-used directory, last-opened file, theme preference
- **Autosave**: Every 5 seconds to the active file (if one is open)
- **On launch**: Automatically reopens your last-used file

## Key Differences from Browser Version

| Feature | Browser (Vite) | Tauri |
|---------|---------------|-------|
| Data storage | localStorage | `.json` files on disk |
| Save/Open | Manage modal | Native OS file dialogs |
| URL opening | `window.open` | System default browser |
| Excel export | Browser download | Native Save dialog |
| Theme storage | localStorage | Config file |
| Data survives cache clear | No | Yes |
| Runs as | Browser tab | Native window |
| Installer size | N/A | ~5-10 MB |

## Generating App Icons

The `src-tauri/icons/` directory needs icon files. Generate them from a source PNG:
```bash
npm run tauri icon path/to/your-icon.png
```
Or create placeholder icons manually (32x32, 128x128, 128x128@2x PNGs, plus .ico and .icns).
