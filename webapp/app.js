// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID_HERE';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];

// UI State Management
let pollInterval = null;
let currentTrackId = null;
let artistImageCache = new Map();
let currentBPM = 120; // Default BPM
let bpmInterval = null;

// DOM Elements
const screens = {
  auth: document.getElementById('auth-screen'),
  loading: document.getElementById('loading-screen'),
  player: document.getElementById('player-screen'),
  error: document.getElementById('error-screen')
};

const elements = {
  authButton: document.getElementById('auth-button'),
  logoutButton: document.getElementById('logout-button'),
  retryButton: document.getElementById('retry-button'),
  idleState: document.getElementById('idle-state'),
  nowPlaying: document.getElementById('now-playing'),
  rateLimitNotice: document.getElementById('rate-limit-notice'),
  trackName: document.getElementById('track-name'),
  artistName: document.getElementById('artist-name'),
  albumName: document.getElementById('album-name'),
  albumArt: document.getElementById('album-art'),
  artistWall: document.getElementById('artist-wall'),
  progressFill: document.getElementById('progress-fill'),
  currentTime: document.getElementById('current-time'),
  totalTime: document.getElementById('total-time'),
  errorMessage: document.getElementById('error-message')
};

// ===== PKCE Helper Functions =====

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

// ===== Token Management =====

function storeTokens(accessToken, expiresIn, refreshToken = null) {
  const expiryTime = Date.now() + (expiresIn * 1000);
  localStorage.setItem('spotify_access_token', accessToken);
  localStorage.setItem('spotify_token_expiry', expiryTime.toString());
  if (refreshToken) {
    localStorage.setItem('spotify_refresh_token', refreshToken);
  }
}

function getStoredTokens() {
  return {
    accessToken: localStorage.getItem('spotify_access_token'),
    tokenExpiry: localStorage.getItem('spotify_token_expiry'),
    refreshToken: localStorage.getItem('spotify_refresh_token')
  };
}

function clearTokens() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_token_expiry');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_code_verifier');
}

function isTokenValid() {
  const { accessToken, tokenExpiry } = getStoredTokens();
  if (!accessToken || !tokenExpiry) {
    return false;
  }
  // Add 60 second buffer to refresh before expiry
  return Date.now() < (parseInt(tokenExpiry) - 60000);
}

// ===== OAuth Flow =====

async function initiateAuth() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store code verifier for later use
  localStorage.setItem('spotify_code_verifier', codeVerifier);
  
  const authUrl = new URL(SPOTIFY_AUTH_URL);
  authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('scope', SCOPES.join(' '));
  authUrl.searchParams.append('code_challenge_method', 'S256');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  
  // Redirect to Spotify authorization
  window.location.href = authUrl.toString();
}

async function handleAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  if (error) {
    showError('Authorization failed: ' + error);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return false;
  }
  
  if (code) {
    showScreen('loading');
    
    try {
      const codeVerifier = localStorage.getItem('spotify_code_verifier');
      
      if (!codeVerifier) {
        throw new Error('Code verifier not found');
      }
      
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
          code_verifier: codeVerifier
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }
      
      const tokenData = await tokenResponse.json();
      storeTokens(tokenData.access_token, tokenData.expires_in, tokenData.refresh_token);
      
      // Clean up code verifier and URL
      localStorage.removeItem('spotify_code_verifier');
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return true;
    } catch (error) {
      console.error('Token exchange error:', error);
      showError('Failed to complete authentication');
      window.history.replaceState({}, document.title, window.location.pathname);
      return false;
    }
  }
  
  return false;
}

async function refreshAccessToken() {
  const { refreshToken } = getStoredTokens();
  
  if (!refreshToken) {
    return false;
  }
  
  try {
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
      return false;
    }
    
    const tokenData = await tokenResponse.json();
    storeTokens(
      tokenData.access_token,
      tokenData.expires_in,
      tokenData.refresh_token || refreshToken
    );
    
    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

// ===== Spotify API Calls =====

async function makeSpotifyRequest(endpoint) {
  // Check if token is valid
  if (!isTokenValid()) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return { error: 'Authentication required', needsAuth: true };
    }
  }
  
  const { accessToken } = getStoredTokens();
  
  try {
    const response = await fetch(`https://api.spotify.com${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.status === 401) {
      // Token invalid, try to refresh
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
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

async function getCurrentlyPlaying() {
  return await makeSpotifyRequest('/v1/me/player/currently-playing');
}

async function getArtist(artistId) {
  return await makeSpotifyRequest(`/v1/artists/${artistId}`);
}

async function getRelatedArtists(artistId) {
  return await makeSpotifyRequest(`/v1/artists/${artistId}/related-artists`);
}

async function getAudioFeatures(trackId) {
  return await makeSpotifyRequest(`/v1/audio-features/${trackId}`);
}

// ===== UI Functions =====

function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.style.display = 'none');
  if (screens[screenName]) {
    screens[screenName].style.display = 'block';
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  showScreen('error');
}

// Generate deterministic color from string
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = Math.abs((hash * 137) % 360);
  return { hue1, hue2 };
}

async function fetchCurrentlyPlaying() {
  try {
    const response = await getCurrentlyPlaying();
    
    if (response.needsAuth) {
      stopPolling();
      clearTokens();
      showScreen('auth');
      return;
    }
    
    if (response.rateLimited) {
      elements.rateLimitNotice.style.display = 'block';
      setTimeout(() => {
        elements.rateLimitNotice.style.display = 'none';
      }, 5000);
      return;
    }
    
    if (response.error) {
      console.error('API Error:', response.error);
      return;
    }
    
    updateUI(response.data);
  } catch (error) {
    console.error('Failed to fetch currently playing:', error);
  }
}

function updateUI(data) {
  if (!data || !data.item) {
    elements.nowPlaying.style.display = 'none';
    elements.idleState.style.display = 'block';
    return;
  }
  
  elements.idleState.style.display = 'none';
  elements.nowPlaying.style.display = 'block';
  
  const track = data.item;
  const isNewTrack = currentTrackId !== track.id;
  
  if (isNewTrack) {
    currentTrackId = track.id;
    
    elements.trackName.textContent = track.name;
    elements.artistName.textContent = track.artists.map(a => a.name).join(', ');
    elements.albumName.textContent = track.album.name;
    
    const albumImage = track.album.images[0]?.url;
    if (albumImage) {
      elements.albumArt.src = albumImage;
    }
    
    updateArtistWall(track.artists, albumImage);
  }
  
  updateProgress(data.progress_ms, track.duration_ms);
}

function updateProgress(currentMs, totalMs) {
  const progress = (currentMs / totalMs) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.currentTime.textContent = formatTime(currentMs);
  elements.totalTime.textContent = formatTime(totalMs);
}

async function updateArtistWall(artists, albumArtUrl) {
  elements.artistWall.innerHTML = '';
  
  const images = [];
  const seenArtists = new Set();
  
  // Fetch artist images
  for (const artist of artists) {
    if (seenArtists.has(artist.id)) continue;
    seenArtists.add(artist.id);
    
    try {
      if (artistImageCache.has(artist.id)) {
        const imageUrl = artistImageCache.get(artist.id);
        images.push({ url: imageUrl, type: 'image', name: artist.name });
        continue;
      }
      
      const response = await getArtist(artist.id);
      
      if (response.data && response.data.images && response.data.images.length > 0) {
        const imageUrl = response.data.images[0].url;
        artistImageCache.set(artist.id, imageUrl);
        images.push({ url: imageUrl, type: 'image', name: artist.name });
      }
    } catch (error) {
      console.error('Failed to fetch artist:', error);
    }
  }
  
  // Fetch related artists
  if (artists.length > 0 && images.length < 15) {
    try {
      const response = await getRelatedArtists(artists[0].id);
      
      if (response.data && response.data.artists) {
        for (const relatedArtist of response.data.artists) {
          if (images.length >= 15) break;
          if (seenArtists.has(relatedArtist.id)) continue;
          seenArtists.add(relatedArtist.id);
          
          if (relatedArtist.images && relatedArtist.images.length > 0) {
            const imageUrl = relatedArtist.images[0].url;
            artistImageCache.set(relatedArtist.id, imageUrl);
            images.push({ url: imageUrl, type: 'image', name: relatedArtist.name });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch related artists:', error);
    }
  }
  
  // Fill remaining slots with fallback
  while (images.length < 15) {
    if (albumArtUrl && images.length % 3 === 0) {
      images.push({ url: albumArtUrl, type: 'blur', name: '' });
    } else {
      const artistName = artists[0]?.name || 'Unknown';
      const initials = artistName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
      images.push({ type: 'gradient', initials, name: artistName });
    }
  }
  
  // Create floating artist images at random positions
  images.slice(0, 15).forEach((imageData, index) => {
    const tile = document.createElement('div');
    tile.className = 'artist-tile';
    
    // Random position across the screen
    const randomX = Math.random() * 80 + 10; // 10-90% of screen width
    const randomY = Math.random() * 80 + 10; // 10-90% of screen height
    const randomSize = Math.random() * 150 + 100; // 100-250px
    const randomDelay = Math.random() * 8; // 0-8s delay
    const randomDuration = Math.random() * 4 + 6; // 6-10s duration
    
    tile.style.left = `${randomX}%`;
    tile.style.top = `${randomY}%`;
    tile.style.width = `${randomSize}px`;
    tile.style.height = `${randomSize}px`;
    tile.style.animationDelay = `${randomDelay}s`;
    tile.style.animationDuration = `${randomDuration}s`;
    
    if (imageData.type === 'image') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.title = imageData.name;
    } else if (imageData.type === 'blur') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.style.filter = 'blur(8px)';
      tile.style.opacity = '0.4';
    } else if (imageData.type === 'gradient') {
      const colors = stringToColor(imageData.name);
      tile.style.background = `linear-gradient(135deg, 
        hsl(${colors.hue1}, 70%, 50%), 
        hsl(${colors.hue2}, 70%, 30%))`;
      tile.textContent = imageData.initials;
      tile.style.display = 'flex';
      tile.style.alignItems = 'center';
      tile.style.justifyContent = 'center';
      tile.style.fontSize = '24px';
      tile.style.fontWeight = 'bold';
      tile.title = imageData.name;
    }
    
    elements.artistWall.appendChild(tile);
  });
}

function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  fetchCurrentlyPlaying();
  pollInterval = setInterval(fetchCurrentlyPlaying, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function handleLogout() {
  stopPolling();
  clearTokens();
  currentTrackId = null;
  artistImageCache.clear();
  showScreen('auth');
}

// ===== Event Listeners =====

elements.authButton.addEventListener('click', initiateAuth);
elements.logoutButton.addEventListener('click', handleLogout);
elements.retryButton.addEventListener('click', () => {
  initApp();
});

// ===== App Initialization =====

async function initApp() {
  showScreen('loading');
  
  // Check for OAuth callback
  const hasAuthCode = await handleAuthCallback();
  
  // Check if we have valid tokens
  if (hasAuthCode || isTokenValid()) {
    showScreen('player');
    startPolling();
  } else {
    showScreen('auth');
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initApp);

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  stopPolling();
});
