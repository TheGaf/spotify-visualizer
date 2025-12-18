// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = 'a643758462b24eb0933391284696b322';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming'
];

// UI State Management
let pollInterval = null;
let currentTrackId = null;
let artistImageCache = new Map();
let currentBPM = 120; // Default BPM
let bpmInterval = null;
let currentAudioFeatures = null; // Store energy, valence for colors
let animationFrameId = null;

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
  errorMessage: document.getElementById('error-message'),
  playPauseButton: document.getElementById('play-pause-button'),
  prevButton: document.getElementById('prev-button'),
  nextButton: document.getElementById('next-button'),
  geometricCanvas: document.getElementById('geometric-canvas'),
  canvasVideo: document.getElementById('canvas-video'),
  fullscreenButton: document.getElementById('fullscreen-button'),
  vizAlbumsBtn: document.getElementById('viz-albums'),
  vizCanvasBtn: document.getElementById('viz-canvas'),
  vizGeometricBtn: document.getElementById('viz-geometric'),
  brandingBox: document.getElementById('branding-box'),
  brandingClose: document.getElementById('branding-close'),
  brandingOpen: document.getElementById('branding-open')
};

// ===== State Management =====
let visualizationMode = 'albums'; // 'albums', 'canvas', or 'waveform'

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

async function getArtistAlbums(artistId) {
  return await makeSpotifyRequest(`/v1/artists/${artistId}/albums?limit=20`);
}

// Playback control functions
async function playPause() {
  const { accessToken } = getStoredTokens();
  const currentState = await makeSpotifyRequest('/v1/me/player');
  
  if (currentState.data && currentState.data.is_playing) {
    // Pause
    return await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  } else {
    // Play
    return await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
  }
}

async function skipNext() {
  const { accessToken } = getStoredTokens();
  return await fetch('https://api.spotify.com/v1/me/player/next', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

async function skipPrevious() {
  const { accessToken } = getStoredTokens();
  return await fetch('https://api.spotify.com/v1/me/player/previous', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

async function setVolume(volumePercent) {
  const { accessToken } = getStoredTokens();
  return await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${volumePercent}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
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

// Kaleidosync-style audio-reactive visualizer (smooth, not epileptic)
function startSonicWaveform(bpm, audioFeatures) {
  const canvas = elements.geometricCanvas;
  const ctx = canvas.getContext('2d');
  
  // Set canvas size
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const beatDuration = 60000 / bpm; // ms per beat
  let startTime = Date.now();
  let frame = 0;
  
  // Use audio features for color (Kaleidosync-style mood mapping)
  const energy = audioFeatures?.energy || 0.5;
  const valence = audioFeatures?.valence || 0.5;
  
  // Map valence to color (mood-based)
  let baseHue;
  if (valence < 0.3) {
    baseHue = 240; // Blue/purple for sad songs
  } else if (valence < 0.7) {
    baseHue = 150; // Green/cyan for neutral
  } else {
    baseHue = 30; // Warm orange/yellow for happy songs
  }
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const particleCount = 80;
  const particles = [];
  
  // Initialize particles
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      angle: (i / particleCount) * Math.PI * 2,
      radius: 0,
      speed: 0.5 + Math.random() * 0.5,
      size: 2 + Math.random() * 3
    });
  }
  
  function drawKaleidosync() {
    if (visualizationMode !== 'waveform') {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const beatProgress = (elapsed % beatDuration) / beatDuration;
    const beatPulse = Math.sin(beatProgress * Math.PI * 2) * 0.5 + 0.5;
    
    // Gentle fade for smooth trails (not epileptic)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Rotation speed based on BPM
    const rotationSpeed = (bpm / 60) * 0.01;
    
    // Draw radial particles
    particles.forEach((particle, i) => {
      // Update particle position
      particle.angle += rotationSpeed;
      particle.radius = (Math.sin(frame * 0.02 + i * 0.1) * 0.5 + 0.5) * Math.min(canvas.width, canvas.height) * 0.4;
      
      const x = centerX + Math.cos(particle.angle) * particle.radius;
      const y = centerY + Math.sin(particle.angle) * particle.radius;
      
      // Color shifts based on position and audio features
      const hue = (baseHue + (i / particleCount) * 120 + frame * 0.3) % 360;
      const saturation = 70 + (energy * 20);
      const lightness = 50 + (beatPulse * 15);
      const alpha = 0.6 + (beatPulse * 0.3);
      
      // Draw particle with glow
      const size = particle.size * (1 + beatPulse * 0.5 * energy);
      
      // Outer glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
      gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
      gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.3})`);
      gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size * 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner core
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha + 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Add center pulse
    const centerPulseSize = (beatPulse * 80 + 40) * (0.8 + energy * 0.4);
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, centerPulseSize);
    centerGradient.addColorStop(0, `hsla(${baseHue}, 80%, 60%, ${beatPulse * 0.4})`);
    centerGradient.addColorStop(1, `hsla(${baseHue}, 80%, 60%, 0)`);
    
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerPulseSize, 0, Math.PI * 2);
    ctx.fill();
    
    frame++;
    animationFrameId = requestAnimationFrame(drawKaleidosync);
  }
  
  drawKaleidosync();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

function stopSonicWaveform() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  const canvas = elements.geometricCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function fetchAndSetupVisualization(trackId, artists, albumImage) {
  // Fetch BPM and audio features
  try {
    const audioFeatures = await getAudioFeatures(trackId);
    if (audioFeatures.data && audioFeatures.data.tempo) {
      currentBPM = audioFeatures.data.tempo;
      currentAudioFeatures = audioFeatures.data;
    }
  } catch (error) {
    console.error('Failed to fetch audio features:', error);
  }
  
  // Always update artist wall (for when user switches to album mode)
  await updateArtistWall(artists, albumImage);
  
  // Apply current visualization mode
  updateVisualization();
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
  
  // Update play/pause button based on playback state
  if (data.is_playing) {
    elements.playPauseButton.textContent = '⏸';
    elements.playPauseButton.title = 'Pause';
  } else {
    elements.playPauseButton.textContent = '▶';
    elements.playPauseButton.title = 'Play';
  }
  
  if (isNewTrack) {
    currentTrackId = track.id;
    
    elements.trackName.textContent = track.name;
    elements.artistName.textContent = track.artists.map(a => a.name).join(', ');
    
    // Add release year to album name
    const albumYear = track.album.release_date ? track.album.release_date.split('-')[0] : '';
    elements.albumName.textContent = albumYear ? `${track.album.name} (${albumYear})` : track.album.name;
    
    const albumImage = track.album.images[0]?.url;
    if (albumImage) {
      elements.albumArt.src = albumImage;
    }
    
    // Fetch BPM and start visualization
    fetchAndSetupVisualization(track.id, track.artists, albumImage);
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
  let hasRealImages = false;
  
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
        hasRealImages = true;
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
            hasRealImages = true;
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch related artists:', error);
    }
  }
  
  // Fetch artist albums for additional background images
  if (artists.length > 0 && images.length < 15) {
    try {
      const albumsResponse = await getArtistAlbums(artists[0].id);
      
      if (albumsResponse.data && albumsResponse.data.items) {
        for (const album of albumsResponse.data.items) {
          if (images.length >= 15) break;
          if (album.images && album.images.length > 0) {
            images.push({ url: album.images[0].url, type: 'album', name: album.name });
            hasRealImages = true;
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch artist albums:', error);
    }
  }
  
  // Fill remaining slots with blurred album art (no gradient tiles)
  while (images.length < 15 && albumArtUrl) {
    images.push({ url: albumArtUrl, type: 'blur', name: '' });
  }
  
  // Create floating artist images at random positions with continuous cycling
  images.slice(0, 15).forEach((imageData, index) => {
    const tile = document.createElement('div');
    tile.className = 'artist-tile';
    tile.dataset.imageUrl = imageData.url;
    tile.dataset.imageType = imageData.type;
    tile.dataset.imageName = imageData.name || '';
    
    // Set initial random position and size
    repositionTile(tile);
    
    // Random initial delay before first cycle
    const randomDelay = Math.random() * 5;
    tile.style.animationDelay = `${randomDelay}s`;
    
    // Set image
    if (imageData.type === 'image' || imageData.type === 'album') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.title = imageData.name;
    } else if (imageData.type === 'blur') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.style.filter = 'blur(8px)';
      tile.style.opacity = '0.4';
    }
    
    // Re-randomize position/size when animation cycle completes
    tile.addEventListener('animationiteration', () => {
      repositionTile(tile);
    });
    
    elements.artistWall.appendChild(tile);
  });
  
  return hasRealImages;
}

// Helper function to set random position and size for a tile
function repositionTile(tile) {
  const randomX = Math.random() * 120 - 10; // -10% to 110%
  const randomY = Math.random() * 120 - 10;
  const randomSize = Math.random() * 180 + 120; // 120-300px
  const randomDuration = Math.random() * 8 + 12; // 12-20s cycle (increased minimum)
  
  tile.style.left = `${randomX}%`;
  tile.style.top = `${randomY}%`;
  tile.style.width = `${randomSize}px`;
  tile.style.height = `${randomSize}px`;
  tile.style.animationDuration = `${randomDuration}s`;
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

// Playback control event listeners
elements.playPauseButton.addEventListener('click', async () => {
  try {
    await playPause();
    // Update immediately to reflect change
    setTimeout(() => fetchCurrentlyPlaying(), 500);
  } catch (error) {
    console.error('Playback control error:', error);
  }
});

elements.nextButton.addEventListener('click', async () => {
  try {
    await skipNext();
    setTimeout(() => fetchCurrentlyPlaying(), 500);
  } catch (error) {
    console.error('Skip next error:', error);
  }
});

elements.prevButton.addEventListener('click', async () => {
  try {
    await skipPrevious();
    setTimeout(() => fetchCurrentlyPlaying(), 500);
  } catch (error) {
    console.error('Skip previous error:', error);
  }
});

// Fullscreen button
elements.fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    document.body.classList.add('fullscreen-mode');
  } else {
    document.exitFullscreen();
    document.body.classList.remove('fullscreen-mode');
  }
});

// Visualization mode buttons
elements.vizAlbumsBtn.addEventListener('click', () => {
  visualizationMode = 'albums';
  updateVizButtons();
  updateVisualization();
});

elements.vizCanvasBtn.addEventListener('click', () => {
  visualizationMode = 'canvas';
  updateVizButtons();
  updateVisualization();
});

elements.vizGeometricBtn.addEventListener('click', () => {
  visualizationMode = 'waveform';
  updateVizButtons();
  updateVisualization();
});

// Branding box show/hide handlers
elements.brandingClose.addEventListener('click', () => {
  elements.brandingBox.classList.add('hidden');
  elements.brandingOpen.style.display = 'flex';
});

elements.brandingOpen.addEventListener('click', () => {
  elements.brandingBox.classList.remove('hidden');
  elements.brandingOpen.style.display = 'none';
});

function updateVizButtons() {
  elements.vizAlbumsBtn.classList.toggle('active', visualizationMode === 'albums');
  elements.vizCanvasBtn.classList.toggle('active', visualizationMode === 'canvas');
  elements.vizGeometricBtn.classList.toggle('active', visualizationMode === 'waveform');
}

function updateVisualization() {
  // Hide/show based on mode - mutually exclusive
  if (visualizationMode === 'albums') {
    // Show floating album covers
    elements.artistWall.parentElement.style.display = 'block';
    elements.canvasVideo.style.display = 'none';
    elements.geometricCanvas.style.display = 'none';
    stopSonicWaveform();
  } else if (visualizationMode === 'canvas') {
    // Show canvas video (Note: Spotify Canvas videos require partner API access, not available in standard Web API)
    // If Canvas becomes available, this mode will display it. For now, falls back to albums.
    console.log('Canvas video mode selected, but Spotify Canvas requires partner API access');
    // Fallback to albums mode since Canvas isn't available
    visualizationMode = 'albums';
    elements.vizAlbumsBtn.classList.add('active');
    elements.vizCanvasBtn.classList.remove('active');
    updateVisualization(); // Recursively call with albums mode
  } else if (visualizationMode === 'waveform') {
    // Show sonic waveform
    elements.artistWall.parentElement.style.display = 'none';
    elements.canvasVideo.style.display = 'none';
    elements.geometricCanvas.style.display = 'block';
    if (currentBPM) {
      startSonicWaveform(currentBPM, currentAudioFeatures);
    }
  }
}

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
