// Cache for loaded comparison data
const comparisonCache = new Map();

/**
 * Gets the stored user's GitHub username for comparison (from localStorage only)
 * This represents "The Visitor" (You)
 */
export function getStoredUsername() {
    return localStorage.getItem('comparison_github_username');
}

/**
 * Sets the user's GitHub username for comparison (localStorage only)
 */
function setStoredUsername(username) {
    localStorage.setItem('comparison_github_username', username);
}

/**
 * Detects who owns the current page.
 * Prioritizes window.githubUsername but ignores the default "User".
 */
function getPageOwner() {
    let owner = window.githubUsername;
    
    // If the global var is missing or is the generic default "User", 
    // fall back to the hostname (e.g., 'roschach96' from 'roschach96.github.io')
    if (!owner || owner === 'User') {
        owner = window.location.hostname.split('.')[0];
    }
    
    return owner || 'unknown';
}

/**
 * Detects if the person browsing IS the person who owns the page.
 */
export function isOwnProfile() {
    const pageOwner = getPageOwner();
    const visitor = getStoredUsername();
    
    if (!visitor) return false; 
    
    return visitor.toLowerCase() === pageOwner.toLowerCase();
}

/**
 * Shows a modal dialog to select comparison user
 */
export async function selectComparisonUser() {
    const currentProfileUser = getPageOwner();
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'comparison-modal-overlay';
    modal.innerHTML = `
        <div class="comparison-modal">
            <div class="comparison-modal-header">
                <div>
                    <h3 style="margin: 0;">Who are you?</h3>
                    <div style="font-size: 0.75em; color: #8f98a0; margin-top: 4px; font-weight: normal;">
                        Select your own profile so we know who "You" are.
                    </div>
                </div>
                <button class="comparison-modal-close" onclick="this.closest('.comparison-modal-overlay').remove()">×</button>
            </div>
            <div class="comparison-modal-body">
                <div class="comparison-loading">
                    <div class="loading-spinner"></div>
                    <div>Loading network...</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fetch users
    const users = await fetchAvailableUsers();
    
    // ✅ Show ALL users (including the current page owner)
    const availableUsers = users;
    
    if (availableUsers.length === 0) {
        modal.querySelector('.comparison-modal-body').innerHTML = `
            <div class="comparison-error">
                <p>No users found.</p>
                <p style="margin-top: 10px; font-size: 0.9em;">Are you online?</p>
            </div>
        `;
        return null;
    }
    
    // Get stored username to highlight it
    const storedUsername = getStoredUsername();
    
    // Build user list
    const userListHTML = availableUsers.map(user => {
        const isSelected = storedUsername && storedUsername.toLowerCase() === user.login.toLowerCase();
        return `
            <div class="comparison-user-item ${isSelected ? 'selected' : ''}" data-username="${user.login}" data-repo="${user.repo}">
                <img src="https://github.com/${user.login}.png" alt="${user.login}" class="comparison-user-avatar">
                <div class="comparison-user-info">
                    <div class="comparison-user-name">${user.login}${user.isOriginal ? ' ⭐' : ''}</div>
                    ${isSelected ? '<div class="comparison-user-badge">You</div>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    modal.querySelector('.comparison-modal-body').innerHTML = `
        <div class="comparison-user-list">
            ${userListHTML}
        </div>
        <div class="comparison-modal-footer">
            <button class="comparison-modal-button cancel" onclick="this.closest('.comparison-modal-overlay').remove()">Cancel</button>
        </div>
    `;
    
    // Return a promise that resolves when user selects
    return new Promise((resolve) => {
        const userItems = modal.querySelectorAll('.comparison-user-item');
        userItems.forEach(item => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;
                const repo = item.dataset.repo;
                setStoredUsername(username);
                modal.remove();
                
                // If we identify ourselves as the owner of the current page,
                // reload immediately so the Compare Button disappears.
                if (username.toLowerCase() === currentProfileUser.toLowerCase()) {
                    window.location.reload(); 
                } else {
                    resolve({ username, repo });
                }
            });
        });
        
        // Cancel button
        modal.querySelector('.cancel').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });
    });
}

/**
 * Fetches all available users from the hub (root repo + forks)
 */
async function fetchAvailableUsers() {
    try {
        const host = location.hostname;
        const path = location.pathname.split('/').filter(Boolean);
        let owner, repo;
        
        if (host.endsWith('.github.io') && path.length > 0) {
            // Live Site Logic
            owner = host.replace('.github.io', '');
            repo = path[0];
        } else {
            // Localhost Fallback Logic
            owner = 'Roschach96'; 
            repo = 'achievement-viewer';
        }
        
        const repoInfo = await fetch(`https://api.github.com/repos/${owner}/${repo}`).then(r => r.ok ? r.json() : null);
        if (!repoInfo) return [];
        
        // Find the absolute root (if Roschach96 was a fork, find the parent, otherwise use Roschach96)
        const rootOwner = repoInfo.fork && repoInfo.parent ? repoInfo.parent.owner.login : repoInfo.owner.login;
        const rootRepo = repoInfo.fork && repoInfo.parent ? repoInfo.parent.name : repoInfo.name;
        
        const users = [{ login: rootOwner, repo: rootRepo, isOriginal: true }];
        let page = 1;
        
        while (true) {
            const forks = await fetch(`https://api.github.com/repos/${rootOwner}/${rootRepo}/forks?per_page=100&page=${page}`)
                .then(r => r.ok ? r.json() : null);
            
            if (!forks || forks.length === 0) break;
            
            forks.forEach(f => {
                users.push({
                    login: f.owner.login,
                    repo: f.name,
                    isOriginal: false
                });
            });
            
            page++;
        }
        
        return users;
    } catch (error) {
        console.error('Error fetching available users:', error);
        return [];
    }
}

/**
 * Gets the user's own game data for comparison
 */
export async function loadOwnGameData(appId) {
    const ownUsername = getStoredUsername();
    
    if (!ownUsername) return null;
    
    const cacheKey = `${ownUsername}_${appId}`;
    if (comparisonCache.has(cacheKey)) return comparisonCache.get(cacheKey);

    try {
        const repoName = 'achievement-viewer';
        const baseUrl = `https://raw.githubusercontent.com/${ownUsername}/${repoName}/user/`;
        
        let achievementsPath = `AppID/${appId}/achievements.json`;
        let achResponse = await fetch(baseUrl + achievementsPath);
        
        if (!achResponse.ok) {
            achievementsPath = `AppID/${appId}/${appId}.db`;
            achResponse = await fetch(baseUrl + achievementsPath);
        }
        
        if (!achResponse.ok) {
            comparisonCache.set(cacheKey, null);
            return null;
        }

        let achievementsData = await achResponse.json();
        
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
        
        let gameInfo = null;
        try {
            const infoPath = `AppID/${appId}/game-info.json`;
            const infoResponse = await fetch(baseUrl + infoPath);
            if (infoResponse.ok) gameInfo = await infoResponse.json();
        } catch (e) { /* ignore */ }

        const result = {
            achievementsData,
            gameInfo,
            blacklist: gameInfo?.blacklist || [],
            username: ownUsername
        };
        
        comparisonCache.set(cacheKey, result);
        return result;
        
    } catch (error) {
        console.error(`Error loading own game data for ${appId}:`, error);
        comparisonCache.set(cacheKey, null);
        return null;
    }
}

/**
 * Compares achievements between two users
 */
export function compareAchievements(theirGame, ownData) {
    if (!ownData) {
        return { hasData: false, comparison: [] };
    }

    const comparison = [];
    const { achievementsData: ownAchievements, blacklist: ownBlacklist } = ownData;

    for (const achievement of theirGame.achievements) {
        const apiName = achievement.apiname;
        
        if (ownBlacklist.includes(apiName)) continue;

        const ownAch = ownAchievements[apiName];
        const theyHave = achievement.unlocked === true || achievement.unlocked === 1;
        const youHave = ownAch ? (ownAch.earned === true || ownAch.earned === 1) : false;
        
        let status = 'both-locked';
        if (theyHave && youHave) status = 'both-unlocked';
        else if (theyHave && !youHave) status = 'they-only';
        else if (!theyHave && youHave) status = 'you-only';

        comparison.push({
            ...achievement,
            status,
            yourUnlockTime: ownAch?.earned_time || ownAch?.unlock_time || ownAch?.unlocktime || 0,
            theirUnlockTime: achievement.unlocktime || 0
        });
    }

    return { hasData: true, comparison };
}

/**
 * Calculates comparison statistics
 */
export function getComparisonStats(comparison) {
    const bothUnlocked = comparison.filter(a => a.status === 'both-unlocked').length;
    const youOnly = comparison.filter(a => a.status === 'you-only').length;
    const theyOnly = comparison.filter(a => a.status === 'they-only').length;
    const bothLocked = comparison.filter(a => a.status === 'both-locked').length;
    
    return {
        bothUnlocked, youOnly, theyOnly, bothLocked,
        yourTotal: bothUnlocked + youOnly,
        theirTotal: bothUnlocked + theyOnly,
        total: comparison.length
    };
}

/**
 * Renders comparison UI
 */
export function renderComparisonView(theirGame, comparisonData, theirUsername) {
    const ownUsername = getStoredUsername();
    
    if (!comparisonData.hasData) {
        return `
            <div class="comparison-unavailable">
                <div class="comparison-unavailable-icon">🔒</div>
                <h3>No Data Found</h3>
                <p>Could not find achievement data for <strong>${theirGame.name}</strong> on <strong>${ownUsername}</strong>'s profile.</p>
                <button class="compare-button" onclick="window.changeComparisonUser()" style="margin-top: 15px;">
                    🔄 Select Different User
                </button>
            </div>
        `;
    }

    const stats = getComparisonStats(comparisonData.comparison);
    
    return `
        <div class="comparison-header">
            <div class="comparison-users">
                <div class="comparison-user">
                    <img src="https://github.com/${ownUsername}.png" alt="${ownUsername}" class="comparison-avatar">
                    <div class="comparison-username">${ownUsername} <span style="font-size:0.8em; opacity:0.7">(You)</span></div>
                    <div class="comparison-count">${stats.yourTotal}/${stats.total}</div>
                </div>
                <div class="comparison-vs">VS</div>
                <div class="comparison-user">
                    <img src="https://github.com/${theirUsername}.png" alt="${theirUsername}" class="comparison-avatar">
                    <div class="comparison-username">${theirUsername}</div>
                    <div class="comparison-count">${stats.theirTotal}/${stats.total}</div>
                </div>
            </div>
            
            <div class="comparison-stats">
                <div class="comparison-stat">
                    <div class="stat-value" style="color: #66c0f4;">${stats.bothUnlocked}</div>
                    <div class="stat-label">Both</div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-value" style="color: #90EE90;">${stats.youOnly}</div>
                    <div class="stat-label">You Only</div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-value" style="color: #FFB84D;">${stats.theyOnly}</div>
                    <div class="stat-label">Them Only</div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #3d5a6c;">
                <button class="comparison-filter-btn" onclick="window.changeComparisonUser()" style="font-size: 12px;">
                    🔄 Switch Profile (Not ${ownUsername}?)
                </button>
            </div>
        </div>

        <div class="comparison-filters">
            <button class="comparison-filter-btn active" data-filter="all">All (${stats.total})</button>
            <button class="comparison-filter-btn" data-filter="both-unlocked">Both (${stats.bothUnlocked})</button>
            <button class="comparison-filter-btn" data-filter="you-only">You Only (${stats.youOnly})</button>
            <button class="comparison-filter-btn" data-filter="they-only">Them Only (${stats.theyOnly})</button>
            <button class="comparison-filter-btn" data-filter="both-locked">Locked (${stats.bothLocked})</button>
        </div>

        <div class="comparison-achievements" id="comparison-achievements-list">
            ${comparisonData.comparison.map(ach => renderComparisonAchievement(ach)).join('')}
        </div>
    `;
}

/**
 * Renders a single achievement in comparison mode
 */
function renderComparisonAchievement(ach) {
    const isHidden = ach.hidden === true || ach.hidden === 1;
    const hasDescription = ach.description && ach.description.trim() !== '';
    
    let descriptionHTML = '';
    
    if (isHidden) {
        if (hasDescription) {
            descriptionHTML = `<div class="achievement-desc hidden-spoiler">Hidden achievement:<span class="hidden-spoiler-text">${ach.description}</span></div>`;
        } else {
            descriptionHTML = `<div class="achievement-desc hidden-desc">Hidden achievement</div>`;
        }
    } else {
        if (hasDescription) {
            descriptionHTML = `<div class="achievement-desc">${ach.description}</div>`;
        } else {
            descriptionHTML = `<div class="achievement-desc hidden-desc">Hidden achievement</div>`;
        }
    }

    const rarityNum = ach.rarity ? parseFloat(ach.rarity) : null;
    const isRare = rarityNum !== null && !isNaN(rarityNum) && rarityNum < 10;

    let statusClass = '', statusBadge = '';
    
    switch (ach.status) {
        case 'both-unlocked':
            statusClass = 'comparison-both';
            statusBadge = '<div class="comparison-badge badge-both">✓ Both</div>';
            break;
        case 'you-only':
            statusClass = 'comparison-you-only';
            statusBadge = '<div class="comparison-badge badge-you">✓ You</div>';
            break;
        case 'they-only':
            statusClass = 'comparison-they-only';
            statusBadge = '<div class="comparison-badge badge-them">✓ Them</div>';
            break;
        case 'both-locked':
            statusClass = 'comparison-both-locked';
            statusBadge = '<div class="comparison-badge badge-locked">✗ Both Locked</div>';
            break;
    }

    // Logic: If the achievement is colored (unlocked for ANYONE), use colored icon.
    // If it's 'both-locked', use the gray icon.
    const showColor = ach.status !== 'both-locked';
    const iconSrc = showColor ? ach.icon : (ach.icongray || ach.icon);

    return `
        <div class="comparison-achievement ${statusClass}" data-status="${ach.status}">
            ${iconSrc ? 
                `<img src="${iconSrc}" class="achievement-icon ${isRare ? 'rare-glow' : ''}" onerror="this.style.display='none'">` : 
                `<div class="achievement-icon ${isRare ? 'rare-glow' : ''}"></div>`}
            
            <div class="achievement-info">
                <div class="achievement-name">${ach.name}</div>
                ${descriptionHTML}
                <div class="comparison-unlock-times">
                    ${ach.yourUnlockTime > 0 ? `<div class="unlock-time-you">You: ${formatDate(ach.yourUnlockTime)}</div>` : ''}
                    ${ach.theirUnlockTime > 0 ? `<div class="unlock-time-them">Them: ${formatDate(ach.theirUnlockTime)}</div>` : ''}
                </div>
                
                ${rarityNum !== null && !isNaN(rarityNum) ? 
                    `<div class="achievement-rarity ${isRare ? 'rarity-rare' : ''}">${rarityNum.toFixed(1)}% of players have this</div>` : 
                    ''}
            </div>
            ${statusBadge}
        </div>
    `;
}

function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Sets up filter button handlers
 */
export function setupComparisonFilters() {
    const filterButtons = document.querySelectorAll('.comparison-filter-btn');
    const achievementsList = document.getElementById('comparison-achievements-list');
    
    if (!filterButtons.length || !achievementsList) return;
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const achievements = achievementsList.querySelectorAll('.comparison-achievement');
            achievements.forEach(ach => {
                if (filter === 'all' || ach.dataset.status === filter) {
                    ach.style.display = 'flex';
                } else {
                    ach.style.display = 'none';
                }
            });
        });
    });
}

/**
 * Allow user to change the comparison username
 */
export async function changeComparisonUser() {
    const selected = await selectComparisonUser();
    
    if (selected) {
        comparisonCache.clear();
        const { appId, game } = window.currentGameData;
        
        window.currentGameData.compareMode = true;
        window.currentGameData.comparisonData = { hasData: false, loading: true };
        if (window.renderGameDetail) window.renderGameDetail();
        
        try {
            const ownData = await loadOwnGameData(appId);
            const comparisonData = compareAchievements(game, ownData);
            window.currentGameData.comparisonData = comparisonData;
            
            if (window.renderGameDetail) window.renderGameDetail();
            setupComparisonFilters();
        } catch (error) {
            console.error("Failed to change comparison user:", error);
            window.currentGameData.compareMode = false;
            if (window.renderGameDetail) window.renderGameDetail();
        }
    }
}

// Export for use in HTML onclick
window.changeComparisonUser = changeComparisonUser;
