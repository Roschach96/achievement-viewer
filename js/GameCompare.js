// Cache for loaded comparison data
const comparisonCache = new Map();

/**
 * Gets the visitor username directly from the URL 'vs' parameter.
 * Returns null if no 'vs' parameter exists (Guest Mode).
 */
export function getVisitorUsername() {
    return new URLSearchParams(window.location.search).get('vs');
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
    const visitor = getVisitorUsername();
    
    if (!visitor) return false; 
    
    return visitor.toLowerCase() === pageOwner.toLowerCase();
}

/**
 * Gets the user's own game data for comparison
 */
export async function loadOwnGameData(appId) {
    const ownUsername = getVisitorUsername();
    
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
    const ownUsername = getVisitorUsername();
    
    if (!comparisonData.hasData) {
        return `
            <div class="comparison-unavailable">
                <div class="comparison-unavailable-icon">🔒</div>
                <h3>No Data Found</h3>
                <p>Could not find achievement data for <strong>${theirGame.name}</strong> on <strong>${ownUsername}</strong>'s profile.</p>
            </div>
        `;
    }

    const stats = getComparisonStats(comparisonData.comparison);
    
    // Separate achievements: unlocked (any status except both-locked) vs locked (both-locked)
    const unlockedList = comparisonData.comparison.filter(a => a.status !== 'both-locked');
    const lockedList = comparisonData.comparison.filter(a => a.status === 'both-locked');

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
                    <div class="stat-value" style="color: #90EE90;">${stats.bothUnlocked}</div>
                    <div class="stat-label">Both</div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-value" style="color: #66c0f4;">${stats.youOnly}</div>
                    <div class="stat-label">You Only</div>
                </div>
                <div class="comparison-stat">
                    <div class="stat-value" style="color: #FFB84D;">${stats.theyOnly}</div>
                    <div class="stat-label">Them Only</div>
                </div>
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
            ${unlockedList.length > 0 ? `
                <h3 class="achievements-section-title">Unlocked Achievements</h3>
                ${unlockedList.map(ach => renderComparisonAchievement(ach)).join('')}
            ` : ''}
            
            ${lockedList.length > 0 ? `
                <h3 class="achievements-section-title locked-title">Locked Achievements</h3>
                ${lockedList.map(ach => renderComparisonAchievement(ach)).join('')}
            ` : ''}
        </div>
    `;
}

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

    const showColor = ach.status !== 'both-locked';
    const iconSrc = showColor ? ach.icon : (ach.icongray || ach.icon);

    return `
        <div class="comparison-achievement ${statusClass}" data-status="${ach.status}">
            ${iconSrc ? 
                `<img src="${iconSrc}" class="achievement-icon ${isRare ? 'rare-glow' : ''}" onerror="achIconFallback(this)">` : 
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

export function setupComparisonFilters() {
    const filterButtons = document.querySelectorAll('.comparison-filter-btn[data-filter]');
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