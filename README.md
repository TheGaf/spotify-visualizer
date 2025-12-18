# Spotify Visualizer

Display Spotify's "Now Playing" information with a beautiful Gaf-branded UI and dynamic artist photo wall.

## Two Versions Available

### 🌐 Web App (Recommended)
A standalone web application you can host on your own website. **No installation required!**

**Advantages:**
- ✅ Works on any browser (Chrome, Firefox, Safari, Edge)
- ✅ Mobile responsive
- ✅ No installation - just visit a URL
- ✅ Easier to update and share
- ✅ Persistent login with localStorage

👉 **[See webapp/README.md](webapp/README.md)** for setup instructions

### 🔌 Chrome Extension
A browser extension for Chrome users who prefer an extension-based approach.

**Use this if:**
- You specifically want a Chrome extension
- You prefer popup-based UI
- You want Chrome-specific integration

👉 **[See extension/README.md](extension/README.md)** for installation

## Features

Both versions include:
- **Spotify OAuth Authentication** with PKCE
- **Now Playing Display** with track info and progress
- **Artist Photo Wall** - 3x3 grid of artist images
- **Gaf Branding** with custom styling
- **Auto-refresh** every 5 seconds
- **Rate limit handling**
- **Idle state** when nothing is playing

## Quick Start

### Web App (Easiest)
1. Upload `webapp/*` files to your website
2. Configure Spotify Client ID in `app.js`
3. Visit the URL and connect to Spotify
4. Done! 🎉

### Chrome Extension
1. Set up Spotify Developer App
2. Configure Client ID in extension files
3. Load unpacked extension in Chrome
4. Connect and enjoy!

## Spotify Setup (Required for Both)

1. Create app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Get your Client ID
3. Set redirect URI:
   - **Web App**: Your website URL (e.g., `https://gaf.nyc/spotify/`)
   - **Extension**: `https://<extension-id>.chromiumapp.org/`

## Repository Structure

```
spotify-visualizer/
├── webapp/          # 🌐 Standalone web application
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── README.md
│
├── extension/       # 🔌 Chrome extension
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── README.md
│
└── README.md        # This file
```

## Which Should You Use?

**Choose Web App if:**
- You want the simplest solution ✨
- You need cross-browser support
- You want mobile compatibility
- You prefer URL-based access

**Choose Extension if:**
- You specifically need a Chrome extension
- You prefer popup-based interface
- You're already familiar with Chrome extensions

## Credits

- Branding: Gaf (https://gaf.nyc)
- Spotify API: https://developer.spotify.com
