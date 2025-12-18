# Spotify Now Playing - Web App Version

A standalone web application that displays Spotify's "Now Playing" information with Gaf-branded UI and dynamic artist photo wall. No installation required - just host it on your website!

## Features

- **Cross-Browser Compatible**: Works on Chrome, Firefox, Safari, Edge
- **Mobile Responsive**: Adapts to any screen size
- **Persistent Authentication**: Tokens stored in localStorage - stays logged in across sessions
- **OAuth 2.0 with PKCE**: Secure authentication without a backend
- **Auto-refresh**: Polls every 5 seconds for current track
- **Artist Photo Wall**: Dynamic 3x3 grid with fallbacks
- **Gaf Branding**: Styled with https://gaf.nyc/gafstandard.css

## Quick Start

### 1. Set Up Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the details:
   - **App Name**: Spotify Now Playing (or any name)
   - **App Description**: Web app for displaying now playing info
   - **Redirect URI**: Your website URL (e.g., `https://gaf.nyc/spotify/` or `https://yourdomain.com/`)
     - Must match exactly where you host this app
     - Include trailing slash if your hosting setup requires it
5. Click **"Save"**
6. Copy your **Client ID**

### 2. Configure the App

Edit `app.js` and update line 2:

```javascript
const SPOTIFY_CLIENT_ID = 'your_actual_client_id_here';
```

**Important**: The `REDIRECT_URI` is automatically set to your page's URL. If you need to customize it, edit line 4 in `app.js`.

### 3. Host the Files

Upload these files to your web server:
- `index.html`
- `app.js`
- `style.css`

**Example hosting locations:**
- `https://gaf.nyc/spotify/` (recommended)
- `https://yourdomain.com/now-playing/`
- Any static hosting (GitHub Pages, Netlify, Vercel, etc.)

### 4. Update Spotify Redirect URI

Make sure the Redirect URI in your Spotify app settings **exactly matches** where you host the app:
- If hosted at `https://gaf.nyc/spotify/`, use that as redirect URI
- If hosted at `https://gaf.nyc/spotify/index.html`, use that
- Protocol (http/https) and path must match exactly

### 5. Access and Authorize

1. Visit your hosted URL in a browser
2. Click **"Connect to Spotify"**
3. Authorize the app in Spotify's login page
4. You'll be redirected back - now playing info will appear!

## How It Works

### Authentication Flow

1. **First Visit**: User clicks "Connect to Spotify"
2. **OAuth PKCE**: Redirects to Spotify for authorization
3. **Token Exchange**: Exchanges auth code for access & refresh tokens
4. **localStorage**: Stores tokens securely in browser
5. **Auto-refresh**: Refresh token automatically renews access token

### Token Persistence

Tokens are stored in browser's `localStorage`:
- **Access Token**: Valid for ~1 hour, auto-refreshed
- **Refresh Token**: Valid for weeks/months
- **Re-auth needed when**:
  - User clears browser data
  - User clicks "Logout"
  - Refresh token expires (rare)

### API Polling

- Polls `/v1/me/player/currently-playing` every 5 seconds
- Shows idle state when nothing is playing
- Fetches artist images on track change
- Rate limit handling with user notification

## File Structure

```
webapp/
├── index.html      # Main HTML structure
├── app.js          # Application logic, OAuth, API calls
├── style.css       # Responsive styles
└── README.md       # This file
```

## Browser Compatibility

- ✅ Chrome 67+
- ✅ Firefox 60+
- ✅ Safari 11+
- ✅ Edge 79+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

Requires support for:
- `fetch` API
- `crypto.subtle` (for PKCE)
- `localStorage`
- ES6+ JavaScript

## Security

- **No Backend Required**: All authentication happens client-side
- **PKCE Flow**: Prevents authorization code interception
- **Token Storage**: localStorage is isolated per origin
- **No Secrets**: Public client - no client secret needed
- **HTTPS Required**: Spotify requires HTTPS for OAuth redirects (except localhost)

## Customization

### Change Polling Interval

In `app.js`, line 502, change `5000` (5 seconds):

```javascript
pollInterval = setInterval(fetchCurrentlyPlaying, 5000);
```

### Modify Styles

Edit `style.css` or override with your own styles. The app loads Gaf branding from `https://gaf.nyc/gafstandard.css` first, with fallback styles included.

### Artist Wall Grid Size

To change from 3x3 to another size, edit `style.css`:

```css
.artist-wall {
  grid-template-columns: repeat(3, 1fr);  /* Change 3 to desired columns */
  grid-template-rows: repeat(3, 1fr);     /* Change 3 to desired rows */
}
```

Also update `app.js` to fetch more/fewer images (search for `images.length < 9`).

## Troubleshooting

### "Authentication failed" or redirect loop

- Verify Client ID is correct in `app.js`
- Ensure Redirect URI in Spotify Dashboard matches hosting URL exactly
- Check browser console for errors
- Clear localStorage and try again: `localStorage.clear()`

### "No music playing" always shown

- Make sure Spotify is open and playing music
- Check if your Spotify account is active (Premium not required for this)
- Verify token hasn't expired - logout and login again

### Rate limit errors

- Spotify limits API calls
- Wait a moment and it will resume automatically
- Reduce polling frequency if needed

### HTTPS errors (localhost development)

- Use `http://localhost` for local testing
- Spotify allows http://localhost without HTTPS
- For production, HTTPS is required

## Development

To test locally:

1. Use a local web server (not `file://` protocol):
   ```bash
   # Python
   python3 -m http.server 8000
   
   # Node.js
   npx http-server
   
   # PHP
   php -S localhost:8000
   ```

2. Set Redirect URI to `http://localhost:8000/` in Spotify Dashboard

3. Visit `http://localhost:8000/` in browser

## Advantages Over Chrome Extension

✅ No installation required
✅ Works on all browsers
✅ Works on mobile devices
✅ Easier to update (just upload new files)
✅ No Chrome Web Store approval needed
✅ Can be shared with a simple URL
✅ Responsive design for any screen size

## License

This project is provided as-is for personal use.

## Credits

- Branding: Gaf (https://gaf.nyc)
- Spotify API: https://developer.spotify.com
