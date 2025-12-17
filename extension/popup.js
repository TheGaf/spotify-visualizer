// UI State Management
let pollInterval = null;
let currentTrackId = null;
let artistImageCache = new Map();

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

// Show specific screen
function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.style.display = 'none');
  if (screens[screenName]) {
    screens[screenName].style.display = 'block';
  }
}

// Format milliseconds to MM:SS
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Show error
function showError(message) {
  elements.errorMessage.textContent = message;
  showScreen('error');
}

// Initialize authentication
async function initAuth() {
  showScreen('loading');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    
    if (response.valid) {
      showScreen('player');
      startPolling();
    } else {
      showScreen('auth');
    }
  } catch (error) {
    showError('Failed to check authentication status');
  }
}

// Handle authentication
async function handleAuth() {
  showScreen('loading');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'authenticate' });
    
    if (response.success) {
      showScreen('player');
      startPolling();
    } else {
      showError(response.error || 'Authentication failed');
    }
  } catch (error) {
    showError('Authentication failed: ' + error.message);
  }
}

// Handle logout
async function handleLogout() {
  stopPolling();
  
  try {
    await chrome.runtime.sendMessage({ action: 'logout' });
    currentTrackId = null;
    artistImageCache.clear();
    showScreen('auth');
  } catch (error) {
    showError('Logout failed');
  }
}

// Fetch currently playing track
async function fetchCurrentlyPlaying() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCurrentlyPlaying' });
    
    if (response.needsAuth) {
      stopPolling();
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

// Update UI with track data
function updateUI(data) {
  if (!data || !data.item) {
    // Show idle state
    elements.nowPlaying.style.display = 'none';
    elements.idleState.style.display = 'block';
    return;
  }
  
  elements.idleState.style.display = 'none';
  elements.nowPlaying.style.display = 'block';
  
  const track = data.item;
  const isNewTrack = currentTrackId !== track.id;
  
  // Update track info only if track changed
  if (isNewTrack) {
    currentTrackId = track.id;
    
    elements.trackName.textContent = track.name;
    elements.artistName.textContent = track.artists.map(a => a.name).join(', ');
    elements.albumName.textContent = track.album.name;
    
    // Update album art
    const albumImage = track.album.images[0]?.url;
    if (albumImage) {
      elements.albumArt.src = albumImage;
    }
    
    // Update artist wall
    updateArtistWall(track.artists);
  }
  
  // Always update progress
  updateProgress(data.progress_ms, track.duration_ms);
}

// Update progress bar and time
function updateProgress(currentMs, totalMs) {
  const progress = (currentMs / totalMs) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.currentTime.textContent = formatTime(currentMs);
  elements.totalTime.textContent = formatTime(totalMs);
}

// Update artist wall with photos
async function updateArtistWall(artists) {
  elements.artistWall.innerHTML = '';
  
  const images = [];
  
  // Fetch artist images
  for (const artist of artists) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getArtist',
        artistId: artist.id
      });
      
      if (response.data && response.data.images && response.data.images.length > 0) {
        const imageUrl = response.data.images[0].url;
        if (!artistImageCache.has(imageUrl)) {
          images.push({ url: imageUrl, type: 'image', name: artist.name });
          artistImageCache.set(imageUrl, true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch artist:', error);
    }
  }
  
  // Fetch related artists for first artist
  if (artists.length > 0 && images.length < 9) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getRelatedArtists',
        artistId: artists[0].id
      });
      
      if (response.data && response.data.artists) {
        for (const relatedArtist of response.data.artists) {
          if (images.length >= 9) break;
          
          if (relatedArtist.images && relatedArtist.images.length > 0) {
            const imageUrl = relatedArtist.images[0].url;
            if (!artistImageCache.has(imageUrl)) {
              images.push({ url: imageUrl, type: 'image', name: relatedArtist.name });
              artistImageCache.set(imageUrl, true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch related artists:', error);
    }
  }
  
  // Fill remaining slots with fallback
  const albumArtUrl = elements.albumArt.src;
  while (images.length < 9) {
    if (albumArtUrl && images.length % 2 === 0) {
      // Use blurred album art
      images.push({ url: albumArtUrl, type: 'blur', name: '' });
    } else {
      // Use gradient with initials
      const artistName = artists[0]?.name || 'Unknown';
      const initials = artistName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
      images.push({ type: 'gradient', initials, name: artistName });
    }
  }
  
  // Shuffle images for variety
  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [images[i], images[j]] = [images[j], images[i]];
  }
  
  // Create grid items
  images.slice(0, 9).forEach(imageData => {
    const tile = document.createElement('div');
    tile.className = 'artist-tile';
    
    if (imageData.type === 'image') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.title = imageData.name;
    } else if (imageData.type === 'blur') {
      tile.style.backgroundImage = `url(${imageData.url})`;
      tile.style.filter = 'blur(8px)';
      tile.style.opacity = '0.6';
    } else if (imageData.type === 'gradient') {
      tile.style.background = `linear-gradient(135deg, 
        hsl(${Math.random() * 360}, 70%, 50%), 
        hsl(${Math.random() * 360}, 70%, 30%))`;
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

// Start polling for currently playing
function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  // Initial fetch
  fetchCurrentlyPlaying();
  
  // Poll every 5 seconds
  pollInterval = setInterval(fetchCurrentlyPlaying, 5000);
}

// Stop polling
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Event listeners
elements.authButton.addEventListener('click', handleAuth);
elements.logoutButton.addEventListener('click', handleLogout);
elements.retryButton.addEventListener('click', initAuth);

// Cleanup on popup close
window.addEventListener('unload', () => {
  stopPolling();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initAuth);
