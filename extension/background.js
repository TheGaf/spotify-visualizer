// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID_HERE';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

// Generate PKCE code verifier and challenge
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

function base64URLEncode(buffer) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(hash);
}

// Store and retrieve tokens
async function storeTokens(accessToken, expiresIn, refreshToken = null) {
  const expiryTime = Date.now() + (expiresIn * 1000);
  await chrome.storage.local.set({
    accessToken,
    tokenExpiry: expiryTime,
    refreshToken
  });
}

async function getStoredTokens() {
  return await chrome.storage.local.get(['accessToken', 'tokenExpiry', 'refreshToken']);
}

async function clearTokens() {
  await chrome.storage.local.remove(['accessToken', 'tokenExpiry', 'refreshToken']);
}

// Check if token is valid
async function isTokenValid() {
  const { accessToken, tokenExpiry } = await getStoredTokens();
  if (!accessToken || !tokenExpiry) {
    return false;
  }
  // Add 60 second buffer to refresh before expiry
  return Date.now() < (tokenExpiry - 60000);
}

// OAuth Authentication Flow
async function authenticateWithSpotify() {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store code verifier for later use
    await chrome.storage.local.set({ codeVerifier });
    
    const authUrl = new URL(SPOTIFY_AUTH_URL);
    authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);
    
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
    
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    // Exchange code for access token
    const { codeVerifier: storedVerifier } = await chrome.storage.local.get('codeVerifier');
    
    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: storedVerifier
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }
    
    const tokenData = await tokenResponse.json();
    await storeTokens(tokenData.access_token, tokenData.expires_in, tokenData.refresh_token);
    
    // Clean up code verifier
    await chrome.storage.local.remove('codeVerifier');
    
    return { success: true };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: error.message };
  }
}

// Refresh access token
async function refreshAccessToken() {
  try {
    const { refreshToken } = await getStoredTokens();
    
    if (!refreshToken) {
      // No refresh token, need to re-authenticate
      return await authenticateWithSpotify();
    }
    
    const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    
    if (!tokenResponse.ok) {
      // Refresh failed, need to re-authenticate
      return await authenticateWithSpotify();
    }
    
    const tokenData = await tokenResponse.json();
    await storeTokens(
      tokenData.access_token,
      tokenData.expires_in,
      tokenData.refresh_token || refreshToken
    );
    
    return { success: true };
  } catch (error) {
    console.error('Token refresh error:', error);
    return await authenticateWithSpotify();
  }
}

// Make authenticated API call to Spotify
async function makeSpotifyRequest(endpoint) {
  // Check if token is valid
  if (!(await isTokenValid())) {
    const refreshResult = await refreshAccessToken();
    if (!refreshResult.success) {
      return { error: 'Authentication required', needsAuth: true };
    }
  }
  
  const { accessToken } = await getStoredTokens();
  
  try {
    const response = await fetch(`https://api.spotify.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.status === 401) {
      // Token invalid, try to refresh
      const refreshResult = await refreshAccessToken();
      if (!refreshResult.success) {
        return { error: 'Authentication required', needsAuth: true };
      }
      // Retry the request
      return await makeSpotifyRequest(endpoint);
    }
    
    if (response.status === 429) {
      // Rate limited
      const retryAfter = response.headers.get('Retry-After');
      return { error: 'Rate limited', rateLimited: true, retryAfter };
    }
    
    if (response.status === 204 || response.status === 404) {
      // No content or not found (nothing playing)
      return { data: null };
    }
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    return { data };
  } catch (error) {
    console.error('Spotify API error:', error);
    return { error: error.message };
  }
}

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authenticate') {
    authenticateWithSpotify().then(sendResponse);
    return true; // Async response
  }
  
  if (message.action === 'checkAuth') {
    isTokenValid().then(valid => sendResponse({ valid }));
    return true;
  }
  
  if (message.action === 'getCurrentlyPlaying') {
    makeSpotifyRequest('/v1/me/player/currently-playing').then(sendResponse);
    return true;
  }
  
  if (message.action === 'getArtist') {
    makeSpotifyRequest(`/v1/artists/${message.artistId}`).then(sendResponse);
    return true;
  }
  
  if (message.action === 'getRelatedArtists') {
    makeSpotifyRequest(`/v1/artists/${message.artistId}/related-artists`).then(sendResponse);
    return true;
  }
  
  if (message.action === 'logout') {
    clearTokens().then(() => sendResponse({ success: true }));
    return true;
  }
});
