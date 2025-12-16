import { getGitHubUserInfo } from './utils.js';

let userInfo = getGitHubUserInfo();
let baseUrl = `https://raw.githubusercontent.com/${userInfo.username}/${userInfo.repo}/user/`;
export const gamesData = new Map();

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
  window.githubUsername = userInfo.username;
  window.githubAvatarUrl = userInfo.avatarUrl;

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

    // Fallback to game-data.json
    const dataResponse = await fetch(baseUrl + 'game-data.json');
    if (dataResponse.ok) {
      const gameData = await dataResponse.json();
      await loadGamesFromData(gameData);
      return;
    }

    throw new Error('Could not scan AppID folders');
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
