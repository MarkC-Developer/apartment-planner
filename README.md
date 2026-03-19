# Apartment Planner — Tauri Desktop App

A local-first spatial and process planning tool. Your data lives as `.json` files on your own filesystem — no cloud, no localStorage, no browser dependency.

## Architecture

```
apartment-planner-tauri/
├── src/                     # React frontend
│   ├── main.jsx             # React entry point
│   └── ApartmentPlanner.jsx # Main component
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
