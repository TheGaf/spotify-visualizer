# Spotify Now Playing - Gaf Edition

A Chrome extension that displays Spotify's "Now Playing" information in a beautiful Gaf-branded popup UI with an artist photo wall feature.

## Features

### Version 1.0.0

- **Spotify OAuth Authentication**: Secure OAuth 2.0 with PKCE flow
- **Now Playing Display**: Shows current track, artist, album, and progress
- **Artist Photo Wall**: Dynamic 3x3 grid of artist images around album art
- **Gaf Branding**: Styled with https://gaf.nyc/gafstandard.css
- **Auto-refresh**: Polls every 5 seconds while popup is open
- **Rate Limit Handling**: Displays notices when Spotify API rate limits are hit

## Setup Instructions

### 1. Create a Spotify Developer App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the app details:
   - **App Name**: Spotify Now Playing (or any name you prefer)
   - **App Description**: Chrome extension for displaying now playing info
   - **Redirect URI**: See step 2 below
5. Click **"Save"**
6. Copy your **Client ID** from the app settings

### 2. Configure the Redirect URI

The redirect URI must be configured in your Spotify app settings:

1. In your Chrome browser, navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Load this extension (see installation steps below)
4. Note the extension ID (it will look like: `abcdefghijklmnopqrstuvwxyz123456`)
5. The redirect URI will be: `https://<EXTENSION_ID>.chromiumapp.org/`
   - For example: `https://abcdefghijklmnopqrstuvwxyz123456.chromiumapp.org/`
6. Go back to your Spotify Developer Dashboard
7. Edit your app settings
8. Add the redirect URI from step 5 to the **Redirect URIs** list
9. Click **"Save"**

### 3. Insert Your Spotify Client ID

Before loading the extension, you need to add your Client ID in two places:

#### In `manifest.json`:

Find this section:
```json
"oauth2": {
  "client_id": "YOUR_SPOTIFY_CLIENT_ID_HERE",
  ...
}
```

Replace `YOUR_SPOTIFY_CLIENT_ID_HERE` with your actual Client ID.

#### In `background.js`:

Find this line at the top:
```javascript
const SPOTIFY_CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID_HERE';
```

Replace `YOUR_SPOTIFY_CLIENT_ID_HERE` with your actual Client ID.

### 4. Load the Extension into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** using the toggle in the top right corner
3. Click **"Load unpacked"**
4. Select the `/extension` folder from this repository
5. The extension should now appear in your extensions list
6. Click the extension icon in your Chrome toolbar to open the popup

### 5. Connect to Spotify

1. Click the extension icon in your toolbar
2. Click **"Connect to Spotify"** in the popup
3. Authorize the application in the Spotify login page that opens
4. You'll be redirected back and the extension will start showing your currently playing track

## Usage

- **Open the popup**: Click the extension icon in your Chrome toolbar
- **View Now Playing**: If music is playing on Spotify, you'll see:
  - Album art in the center
  - 3x3 grid of artist photos around the album
  - Track name, artist name, and album name
  - Progress bar with elapsed/total time
- **Idle State**: When nothing is playing, an idle message is displayed
- **Logout**: Click the "Logout" button at the bottom to disconnect

## Architecture

### Files

- **manifest.json**: Extension configuration (Manifest V3)
- **background.js**: Service worker handling OAuth and API calls
- **popup.html**: Popup UI structure
- **popup.js**: UI logic and interaction handling
- **popup.css**: Fallback styles (main styles from gaf.nyc)
- **icon16.png, icon48.png, icon128.png**: Extension icons

### Technical Details

- **Authentication**: OAuth 2.0 Authorization Code with PKCE
- **Token Storage**: Uses `chrome.storage.local` for secure token storage
- **Token Refresh**: Automatically refreshes expired tokens
- **API Polling**: Polls `/v1/me/player/currently-playing` every 5 seconds
- **Artist Images**: Fetches from `/v1/artists/{id}` and `/v1/artists/{id}/related-artists`
- **Fallback Images**: Uses blurred album art or gradient tiles with initials when artist photos unavailable

### Permissions

- **storage**: For storing OAuth tokens and settings
- **identity**: For OAuth authentication flow
- **host_permissions**: API access to `https://api.spotify.com/*`

## API Scopes

The extension requests these Spotify API scopes:
- `user-read-currently-playing`: Access to currently playing track
- `user-read-playback-state`: Access to playback state information

## Rate Limiting

If Spotify's API rate limits are encountered (HTTP 429), a notice will be displayed in the popup. The extension will automatically retry after the rate limit period.

## Troubleshooting

### "Authentication failed" error
- Verify your Client ID is correct in both `manifest.json` and `background.js`
- Ensure the redirect URI is correctly configured in Spotify Developer Dashboard
- Make sure the redirect URI matches your extension ID

### "No music playing" message
- Make sure Spotify is open and playing music
- The extension shows your active playback across all devices
- Try playing a track and wait a few seconds for the extension to update

### Extension not loading
- Ensure you've loaded the entire `/extension` folder, not individual files
- Check for errors in `chrome://extensions/` (click "Errors" under the extension)
- Verify all files are present in the extension folder

## Development

To modify the extension:

1. Make changes to the files in the `/extension` folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes by opening the popup

## Security Notes

- Never commit your actual Client ID to public repositories
- Use the placeholder `YOUR_SPOTIFY_CLIENT_ID_HERE` in shared code
- Tokens are stored locally and never shared with third parties
- The extension only requests minimal required permissions

## License

This project is provided as-is for educational and personal use.

## Credits

- Branding: Gaf (https://gaf.nyc)
- Spotify API: https://developer.spotify.com
- Icons: Custom generated with Spotify green (#1DB954)
