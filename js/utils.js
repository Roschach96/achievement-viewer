// Get GitHub username from repository URL
export function getGitHubUserInfo() {
  const currentUrl = window.location.href;
  let githubUsername = 'User';
  let githubAvatarUrl = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
  let githubRepo = 'achievement-viewer';

  const repoMatch = currentUrl.match(/github\.io\/([^\/]+)/);
  if (repoMatch) {
    githubUsername = currentUrl.split('.github.io')[0].split('//')[1];
    githubAvatarUrl = `https://github.com/${githubUsername.toLowerCase()}.png`;
    githubRepo = repoMatch[1];
  }

  return { username: githubUsername, avatarUrl: githubAvatarUrl, repo: githubRepo };
}

// Percentage calculation
export function calculatePercentage(unlocked, total) {
    return total > 0 ? Math.round((unlocked / total) * 100) : 0;
}

// Date formatting
export function formatUnlockDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
}

// ==========================================
// SHARED CACHING & FETCHING LOGIC
// ==========================================

const CACHE_KEY = 'forks-cache-v1';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Shared fetch helper
export const fetchJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null));

// Shared repo detection (for Hub/Forks logic)
export function detectRepo() {
  const host = location.hostname;
  const path = location.pathname.split('/').filter(Boolean);
  if (!host.endsWith('.github.io') || path.length === 0) return { owner: 'Roschach96', repo: 'achievement-viewer' };
  return { owner: host.replace('.github.io', ''), repo: path[0] };
}

// Shared root repo resolution
export async function resolveRootRepo(owner, repo) {
  const info = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
  if (!info) throw new Error('Repo not found');

  if (info.fork && info.parent) {
    return { owner: info.parent.owner.login, repo: info.parent.name };
  }
  // Return the actual cased login from the API
  return { owner: info.owner.login, repo: info.name };
}

// Shared fork fetching with CACHE
export async function fetchAllForks(owner, repo) {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { time, data } = JSON.parse(cached);
      // If cache is fresh (less than 30 mins old), use it!
      if (Date.now() - time < CACHE_TTL && data) return data;
    } catch (e) {
      // ignore parse errors
    }
  }
  
  // Cache expired or missing? Fetch fresh data.
  let forks = [];
  let page = 1;
  while (true) {
    const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/forks?per_page=100&page=${page}`);
    if (!data || !data.length) break;
    forks.push(...data);
    page++;
  }
  
  // Save to cache
  localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data: forks }));
  return forks;
}

// ==========================================
// CACHE CLEANUP
// ==========================================

// Clean up old caches not matching current user
export function cleanOldCaches() {
    const currentUser = getGitHubUserInfo().username;
    const cacheVersion = 'v2'; // Should match CACHE_VERSION in GameLoader.js
    const currentCacheKey = `game-data-cache-${cacheVersion}-${currentUser}`;
    const currentTimestampKey = `game-data-last-updated-${cacheVersion}-${currentUser}`;
    
    let cleaned = 0;
    const keysToRemove = [];
    
    // Collect keys to remove (can't modify localStorage during iteration)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        // Remove old cache data keys
        if (key && key.startsWith('game-data-cache-') && key !== currentCacheKey) {
            keysToRemove.push(key);
        }
        // Remove old timestamp keys
        if (key && key.startsWith('game-data-last-updated-') && key !== currentTimestampKey) {
            keysToRemove.push(key);
        }
    }
    
    // Remove collected keys
    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        cleaned++;
    });
    
    if (cleaned > 0) {
        console.log(`✓ Cleaned ${cleaned} old cache entries from other users`);
    }
}
// ==========================================
// ACHIEVEMENT ICON CDN FALLBACK
// Steam serves older icons from cdn.*/steamcommunity/public/images/apps/
// and newer ones from shared.*/community_assets/images/apps/.
// On <img> error, try the next CDN variant until one works.
// ==========================================
const ICON_CDNS = ['', '.fastly', '.cloudflare', '.akamai'];

function buildIconCandidates(src) {
    const m = src.match(/\/(?:steamcommunity\/public|community_assets)\/images\/apps\/(\d+)\/([^/?#]+)/);
    if (!m) return [];
    const [, appid, file] = m;
    const urls = [];
    for (const cdn of ICON_CDNS) {
        urls.push(`https://cdn${cdn}.steamstatic.com/steamcommunity/public/images/apps/${appid}/${file}`);
        urls.push(`https://shared${cdn}.steamstatic.com/community_assets/images/apps/${appid}/${file}`);
    }
    return urls.filter(u => u !== src);
}

window.achIconFallback = function (img) {
    if (!img._iconCandidates) img._iconCandidates = buildIconCandidates(img.src);
    const next = img._iconCandidates.shift();
    if (next) img.src = next;
    else { img.onerror = null; img.style.display = 'none'; }
};
