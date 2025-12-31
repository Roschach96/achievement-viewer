import { getGitHubUserInfo } from './utils.js';

let userInfo = getGitHubUserInfo();
let baseUrl = `https://raw.githubusercontent.com/${userInfo.username}/${userInfo.repo}/user/`;
export const gamesData = new Map();

// Smart cache management
const CACHE_VERSION = 'v2'; // Increment this to force cache refresh
const CACHE_TIMESTAMP_KEY = `game-data-last-updated-${CACHE_VERSION}`;
const CACHE_DATA_KEY = `game-data-cache-${CACHE_VERSION}`;
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour - fallback if fetch fails

async function loadGameDataWithCache() {
    try {
        const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        const cachedGames = localStorage.getItem(CACHE_DATA_KEY);
        
        let data = null;
        let needsFullFetch = true;

        // 1. SMART CHECK: Fetch only the first 200 bytes to check the timestamp
        // This avoids downloading the full 5MB+ file if nothing changed.
        try {
            const partialResponse = await fetch(baseUrl + 'game-data.json', {
                headers: { 'Range': 'bytes=0-200' }, // Request only the beginning
                cache: 'no-cache'
            });

            // Status 206 means the server respected the Partial Content request
            if (partialResponse.status === 206) {
                const text = await partialResponse.text();
                // Regex to find "last_updated": 1234567890 at the start of the file
                const match = text.match(/"last_updated":\s*(\d+)/);

                if (match && match[1]) {
                    const serverTimestamp = match[1];
                    
                    if (cachedTimestamp && cachedGames && serverTimestamp === cachedTimestamp) {
                        console.log('✓ Smart check: Timestamp unchanged, using cache.');
                        return JSON.parse(cachedGames);
                    }
                    console.log(`✓ Smart check: Update detected (Old: ${cachedTimestamp}, New: ${serverTimestamp})`);
                }
            } 
            // If status is 200, the server ignored Range and sent the whole file (rare but possible)
            else if (partialResponse.status === 200) {
                console.log('ℹ Server ignored Range request, processing full response...');
                data = await partialResponse.json();
                needsFullFetch = false;
            }
        } catch (e) {
            console.warn('Smart check failed (Range request error), falling back to full fetch', e);
        }

        // 2. Full Fetch (only if smart check found an update or failed)
        if (needsFullFetch) {
            console.log('Fetching full game data...');
        const dataResponse = await fetch(baseUrl + 'game-data.json', {
            cache: 'no-cache'
        });
        
        if (!dataResponse.ok) {
            throw new Error('Failed to fetch game-data.json');
        }
            data = await dataResponse.json();
        }
        
        // Handle both old format (array) and new format (object with timestamp)
        let games, lastUpdated, isNewFormat;
        
        if (Array.isArray(data)) {
            // Old format - no timestamp
            console.log('Using old format game-data.json (no timestamp)');
            games = data;
            lastUpdated = null;
            isNewFormat = false;
        } else if (data.games && Array.isArray(data.games)) {
            // New format with timestamp
            games = data.games;
            lastUpdated = data.last_updated;
            isNewFormat = true;
            
            if (lastUpdated) {
                const updateDate = new Date(lastUpdated * 1000);
                console.log(`Game data last updated: ${updateDate.toLocaleString()}`);
            }
        } else {
            throw new Error('Invalid game-data.json format');
        }
        
        // Update Cache (Safely)
        if (isNewFormat && lastUpdated) {
            // Only update if it's different or we just fetched it fresh
            try {
            localStorage.setItem(CACHE_TIMESTAMP_KEY, lastUpdated.toString());
            localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(games));
                console.log('✓ Cache updated successfully');
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                    console.warn('⚠ LocalStorage quota exceeded. Caching disabled for this session.');
                } else {
                    console.error('⚠ Error saving to cache:', e);
                }
            }
        } else {
            console.log('⚠ Old format detected - caching disabled');
        }
        
        return games;
        
    } catch (error) {
        console.error('Error loading game data:', error);
        
        // Fallback to cached data if available and not too old
        const cachedGames = localStorage.getItem(CACHE_DATA_KEY);
        const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        
        if (cachedGames && cachedTimestamp) {
            const now = Math.floor(Date.now() / 1000);
            const cacheAge = (now - parseInt(cachedTimestamp)) * 1000;
            
            if (cacheAge < CACHE_MAX_AGE) {
                console.log('⚠ Using fallback cached data due to error (cache age: ' + 
                            Math.round(cacheAge / 60000) + ' minutes)');
                return JSON.parse(cachedGames);
            }
        }
        
        throw error;
    }
}

// Loading games from GitHub API
export async function loadGamesFromAppIds(appIds) {
    const loadingDiv = document.getElementById('loading');
    let loadedCount = 0;

    for (let appId of appIds) {
        try {
            loadingDiv.innerHTML = `
                <div class="loading-spinner"></div>
                <div>Loading game ${++loadedCount} of ${appIds.length}...</div>
            `;

            // Try achievements.json first
            let achievementsPath = `AppID/${appId}/achievements.json`;
            let achResponse = await fetch(baseUrl + achievementsPath);
            
            // Fallback to .db file
            if (!achResponse.ok) {
                achievementsPath = `AppID/${appId}/${appId}.db`;
                achResponse = await fetch(baseUrl + achievementsPath);
            }
            
            if (!achResponse.ok) continue;

            let achievementsData = await achResponse.json();
            
            // Convert array format to dict
            if (Array.isArray(achievementsData)) {
                const converted = {};
                for (const ach of achievementsData) {
                    if (ach.apiname) {
                        converted[ach.apiname] = {
                            earned: ach.achieved === 1,
                            earned_time: ach.unlocktime || 0
                        };
                    }
                }
                achievementsData = converted;
            }
            
            // Load game-info.json
            let gameInfo = null;
            try {
                const infoPath = `AppID/${appId}/game-info.json`;
                const infoResponse = await fetch(baseUrl + infoPath);
                if (infoResponse.ok) {
                    gameInfo = await infoResponse.json();
                }
            } catch (e) {
                console.log(`No game-info.json for ${appId}`);
            }

            await processGameData(appId, achievementsData, gameInfo);

        } catch (error) {
            console.error(`Error loading AppID ${appId}:`, error);
        }
    }
}

// Loading games from game-data.json
export async function loadGamesFromData(gameDataList) {
    const loadingDiv = document.getElementById('loading');
    
    for (let i = 0; i < gameDataList.length; i++) {
        const gameData = gameDataList[i];
        const appId = String(gameData.appid);
        
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <div>Loading game ${i + 1} of ${gameDataList.length}...</div>
        `;
        
        await processGameData(appId, gameData.achievements, gameData.info);
    }
}

// Processing game data
async function processGameData(appId, achievementsData, gameInfo = null) {
    appId = String(appId);
    let gameName = gameInfo?.name || `Game ${appId}`;
    let gameIcon = gameInfo?.icon || '';
    let usesDb = gameInfo?.uses_db || false;
    let platform = gameInfo?.platform || null;
    let blacklist = gameInfo?.blacklist || [];

    const achievements = [];
    let achData = achievementsData.achievements || achievementsData;
    
    if (gameInfo && gameInfo.achievements) {
        for (let key in gameInfo.achievements) {
            // Skip blacklisted achievements
            if (blacklist.includes(key)) {
                console.log(`Skipping blacklisted achievement: ${key}`);
                continue;
            }
            
            const achInfo = gameInfo.achievements[key];
            const userAch = achData[key];
            
            achievements.push({
                apiname: key,
                name: achInfo.name || key,
                description: achInfo.description || '',
                hidden: achInfo.hidden || false,
                icon: achInfo.icon || '',
                icongray: achInfo.icongray || achInfo.icon || '',
                unlocked: userAch ? (userAch.earned || userAch.unlocked || userAch.achieved || false) : false,
                unlocktime: userAch ? (userAch.earned_time || userAch.unlock_time || userAch.unlocktime || 0) : 0,
                rarity: achInfo.percent || null
            });
        }
    } else {
        for (let key in achData) {
            // Skip blacklisted achievements
            if (blacklist.includes(key)) {
                console.log(`Skipping blacklisted achievement: ${key}`);
                continue;
            }
            
            const ach = achData[key];
            
            achievements.push({
                apiname: key,
                name: ach.name || ach.displayName || key,
                description: ach.description || ach.desc || '',
                hidden: ach.hidden || false,
                icon: ach.icon || '',
                icongray: ach.icongray || ach.icon_gray || ach.icon || '',
                unlocked: ach.earned || ach.unlocked || ach.achieved || false,
                unlocktime: ach.earned_time || ach.unlock_time || ach.unlocktime || 0,
                rarity: ach.percent || null
            });
        }
    }

    gamesData.set(appId, {
        appId,
        name: gameName,
        icon: gameIcon,
        achievements,
        usesDb: usesDb,
        platform: platform
    });
}

// Initialization
export async function init() {
    document.getElementById('loading').style.display = 'block';

    if (!userInfo) {
        userInfo = getGitHubUserInfo();
        baseUrl = `https://raw.githubusercontent.com/${userInfo.username}/${userInfo.repo}/user/`;
    }
    
    // Fetch correct casing from GitHub API (Hub Logic)
    try {
        if (userInfo.username !== 'User') {
            const repoResponse = await fetch(`https://api.github.com/repos/${userInfo.username}/${userInfo.repo}`);
            if (repoResponse.ok) {
                const repoData = await repoResponse.json();
                userInfo.username = repoData.owner.login;
                userInfo.repo = repoData.name;
                baseUrl = `https://raw.githubusercontent.com/${userInfo.username}/${userInfo.repo}/user/`;
            }
        }
    } catch (e) {
        console.log('Could not fetch repo info for casing correction', e);
    }

    window.githubUsername = userInfo.username;
    window.githubAvatarUrl = userInfo.avatarUrl;

    try {
        // Loading gamercard.html
        const cardResponse = await fetch(baseUrl + 'gamercard.html');
        if (cardResponse.ok) {
            window.gamerCardHTML = await cardResponse.text();
        }
    } catch (e) {
        console.log('No custom gamercard found');
    }
    
    try {
        const currentUrl = window.location.href;
        const repoMatch = currentUrl.match(/github\.io\/([^\/]+)/);

        if (repoMatch) {
            const apiUrl = `https://api.github.com/repos/${userInfo.username}/${userInfo.repo}/contents/AppID`;
            const response = await fetch(apiUrl);

            if (response.ok) {
                const contents = await response.json();
                const appIds = contents
                    .filter((item) => item.type === 'dir')
                    .map((item) => item.name)
                    .filter((name) => /^\d+$/.test(name));

                if (appIds.length > 0) {
                    await loadGamesFromAppIds(appIds);
                    return;
                }
            }
        }

        // Fallback to game-data.json with smart caching
        const gameData = await loadGameDataWithCache();
        await loadGamesFromData(gameData);
        return;

    } catch (error) {
        console.error('Error scanning folders:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('info').style.display = 'block';
        document.getElementById('results').innerHTML = `
            <div class="error">
                <h3>⚠️ Could not auto-scan folders</h3>
                <p style="margin-top: 15px;">Make sure you have:</p>
                <ol style="text-align: left; margin: 15px auto; max-width: 500px;">
                    <li>Created folders in <code>AppID/</code> with game AppIDs as names</li>
                    <li>Added <code>achievements.json</code> or <code>.db</code> files</li>
                    <li>Run the GitHub Actions workflow to generate <code>game-data.json</code></li>
                </ol>
            </div>
        `;
    }
}