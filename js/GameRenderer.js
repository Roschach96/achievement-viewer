import { gamesData } from './GameLoader.js';
import { calculatePercentage, formatUnlockDate } from './utils.js';
import { 
    isOwnProfile, 
    loadOwnGameData, 
    compareAchievements, 
    renderComparisonView,
    setupComparisonFilters,
    getVisitorUsername
} from './GameCompare.js';

// Global search state (Default is now 'name')
let currentSearchTerm = '';
let currentSearchType = 'name'; 

// Search handlers
window.setSearchTerm = function(term) {
    currentSearchTerm = term;
    displayGames();
};

window.setSearchType = function(type) {
    currentSearchType = type;
    displayGames();
};

// Toggle Search Visibility
window.toggleSearch = function() {
    const searchContainer = document.getElementById('search-container');
    const searchBtn = document.getElementById('search-toggle-btn');
    
    // Check if it is currently hidden (either via display style or class)
    const isHidden = searchContainer.style.display === 'none' || searchContainer.classList.contains('hidden');
    
    if (isHidden) {
        // Show it
        searchContainer.style.display = 'block';
        searchContainer.classList.remove('hidden');
        if (searchBtn) searchBtn.classList.add('active');
        
        // Auto-focus the input
        const input = document.getElementById('game-search');
        if (input) input.focus();
    } else {
        // Hide it
        searchContainer.style.display = 'none';
        if (searchBtn) searchBtn.classList.remove('active');
    }
};

export function displayGames() {
    const resultsDiv = document.getElementById('results');
    const summaryDiv = document.getElementById('summary');
    const searchDiv = document.getElementById('search-container');

    document.getElementById('loading').style.display = 'none';

    if (gamesData.size === 0) {
        resultsDiv.innerHTML = '<div class="error">No games with achievements found.</div>';
        return;
    }

    // Show search bar
    if (searchDiv) {
        searchDiv.classList.remove('hidden');
    }

    // Calculate totals
    let totalGames = gamesData.size;
    let totalAchievements = 0;
    let totalUnlocked = 0;
    let perfectGames = 0;

    for (let game of gamesData.values()) {
        totalAchievements += game.achievements.length;
        const unlocked = game.achievements.filter(a => a.unlocked).length;
        totalUnlocked += unlocked;
        
        if (game.achievements.length > 0 && unlocked === game.achievements.length) {
            perfectGames++;
        }
    }

    const overallPercentage = calculatePercentage(totalUnlocked, totalAchievements);

    // Render summary
    renderSummary(summaryDiv, totalGames, perfectGames, totalUnlocked, totalAchievements, overallPercentage);

    // Render games grid
    renderGamesGrid(resultsDiv);
    
    // Backup call to adjust card heights
    setTimeout(adjustCardHeights, 50);
}

function renderSummary(summaryDiv, totalGames, perfectGames, totalUnlocked, totalAchievements, overallPercentage) {
    summaryDiv.style.display = 'block';

    const gamerCard = window.gamerCardHTML || '';

    summaryDiv.innerHTML = `
        <div class="summary" id="summary-box">
            <div class="summary-header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="${window.githubAvatarUrl}" 
                         alt="Profile" 
                         class="profile-icon"
                         onerror="this.src='https://avatars.fastly.steamstatic.com/29283662f3b58488c74ad750539ba5289b53cf6c_full.jpg'">
                    
                    <h2 style="color: #66c0f4; margin: 0;">
                        <span>${window.githubUsername}</span>'s summary
                    </h2>
                </div>

                ${gamerCard ? `<div class="gamer-card-container">${gamerCard}</div>` : ''}
            </div>
            
            <div class="progress-bar" style="max-width: 600px; margin: 0 auto;">
                <div class="progress-fill ${overallPercentage < 6 ? 'low-percentage' : ''}" style="width: ${overallPercentage}%">${overallPercentage}%</div>
            </div>
            
            <div class="summary-stats">
                <div class="stat-item">
                    <div class="stat-value">${totalGames}</div>
                    <div class="stat-label">Games</div>
                </div>
                ${perfectGames > 0 ? `
                <div class="stat-item">
                    <div class="stat-value">${perfectGames}</div>
                    <div class="stat-label">Perfect Game${perfectGames !== 1 ? 's' : ''}</div>
                </div>
                ` : ''}
                <div class="stat-item">
                    <div class="stat-value">${totalUnlocked}/${totalAchievements}</div>
                    <div class="stat-label">Achievements Unlocked</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${overallPercentage}%</div>
                    <div class="stat-label">Completion</div>
                </div>
            </div>
        </div>
    `;
}

function renderGamesGrid(resultsDiv) {
    // Check state for button styling
    const isSearchOpen = document.getElementById('search-container')?.style.display !== 'none';

    const sortControlsHTML = `
        <div class="grid-sort-controls" id="grid-sort-controls">
            <button id="search-toggle-btn" 
                    class="grid-sort-button ${isSearchOpen ? 'active' : ''}" 
                    onclick="window.toggleSearch()" 
                    data-tooltip="Search / Filter">
                🔍
            </button>

            <button class="grid-sort-button ${window.gridSortMode === 'percentage' ? 'active' : ''}" 
                    onclick="window.setGridSortMode('percentage')" 
                    data-tooltip="Sort by Completion Percentage">
                📊 Percentage
            </button>
            <button class="grid-sort-button ${window.gridSortMode === 'recent' ? 'active' : ''}" 
                    onclick="window.setGridSortMode('recent')" 
                    data-tooltip="Sort by Most Recent Achievement">
                🕐 Recent Activity
            </button>
            <button class="grid-sort-button ${window.gridSortMode === 'name' ? 'active' : ''}" 
                    onclick="window.setGridSortMode('name')" 
                    data-tooltip="Sort by Game Name">
                🅰️ Name
            </button>
        </div>
    `;

    let html = '<div class="games-grid" id="games-grid">';

    let sortedGames = sortGames(window.gridSortMode || 'percentage');

    // Apply Search Filter
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase().trim();
        if (term) {
            sortedGames = sortedGames.filter(game => {
                
                // 1. Check Game Name
                if (currentSearchType === 'name') {
                    return game.name.toLowerCase().includes(term);
                }
                
                // 2. Check AppID
                if (currentSearchType === 'appid') {
                    return game.appId.includes(term);
                }
                
                // 3. Check Platform
                if (currentSearchType === 'platform') {
                    const platform = game.platform || (game.usesDb ? 'Steam' : '');
                    return platform.toLowerCase().includes(term);
                }
                
                // 4. Check Achievements (UPDATED FIX)
                if (currentSearchType === 'achievement') {
                    return game.achievements.some(ach => {
                        // Safely convert properties to strings before lowercasing
                        const name = String(ach.name || '').toLowerCase();
                        const description = String(ach.description || '').toLowerCase();
                        const apiname = String(ach.apiname || '').toLowerCase();
                        
                        return name.includes(term) || description.includes(term) || apiname.includes(term);
                    });
                }

                return false;
            });
        }
    }

    if (sortedGames.length === 0) {
        let typeLabel = "Game Name";
        if (currentSearchType === 'appid') typeLabel = "Steam AppID";
        if (currentSearchType === 'platform') typeLabel = "Platform";
        if (currentSearchType === 'achievement') typeLabel = "Achievement Info";

        html += `<div style="grid-column: 1/-1; text-align: center; color: #8f98a0; padding: 40px; font-size: 1.2em;">
                    No games found matching "${currentSearchTerm}" in <strong>${typeLabel}</strong>
                 </div>`;
    } else {
        for (let game of sortedGames) {
            const unlocked = game.achievements.filter(a => a.unlocked).length;
            const total = game.achievements.length;
            const percentage = calculatePercentage(unlocked, total);

            html += renderGameCard(game, percentage);
        }
    }

    html += '</div>';
    resultsDiv.innerHTML = sortControlsHTML + html;
    
    // Focus maintenance is handled by toggleSearch, but we can keep the safety check here
    const searchInput = document.getElementById('game-search');
    if (searchInput && currentSearchTerm && isSearchOpen) {
        searchInput.focus();
    }

    // Adjust card heights based on platform labels
    adjustCardHeights();
}

// sortGames now handles 'name'
function sortGames(mode) {
    // 1. Sort by Name (Alphabetical)
    if (mode === 'name') {
        return Array.from(gamesData.values()).sort((a, b) => {
            return a.name.localeCompare(b.name);
        });
    } 
    // 2. Sort by Recent Activity
    else if (mode === 'recent') {
        return Array.from(gamesData.values()).sort((a, b) => {
            const aMaxTime = Math.max(...a.achievements.filter(ach => ach.unlocked).map(ach => ach.unlocktime || 0));
            const bMaxTime = Math.max(...b.achievements.filter(ach => ach.unlocked).map(ach => ach.unlocktime || 0));
            
            if (aMaxTime === bMaxTime) {
                return a.name.localeCompare(b.name);
            }
            
            return bMaxTime - aMaxTime;
        });
    } 
    // 3. Default (Percentage)
    else {
        return Array.from(gamesData.values()).sort((a, b) => {
            const aUnlocked = a.achievements.filter(x => x.unlocked).length;
            const aTotal = a.achievements.length;
            const bUnlocked = b.achievements.filter(x => x.unlocked).length;
            const bTotal = b.achievements.length;

            const aPercent = calculatePercentage(aUnlocked, aTotal);
            const bPercent = calculatePercentage(bUnlocked, bTotal);

            if (aPercent === bPercent) {
                return a.name.localeCompare(b.name);
            }

            return bPercent - aPercent;
        });
    }
}

function renderGameCard(game, percentage) {
    // Determine what label to show
    let platformLabel = '';
    if (game.platform) {
        platformLabel = `<div class="game-source">${game.platform}</div>`;
    } else if (game.usesDb) {
        platformLabel = '<div class="game-source">Steam</div>';
    }

    return `
        <div class="game-card" onclick="window.showGameDetail('${game.appId}')">
            <div class="game-card-main">
                <div class="game-header">
                    ${game.icon ? 
                        `<img src="${game.icon}" alt="${game.name}" class="game-icon" onerror="this.src='https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image'">` : 
                        `<img src="https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image" class="game-icon">`}
                    <div class="game-info">
                        <div class="game-title">${game.name}</div>
                        <div class="game-appid">AppID: ${game.appId}</div>
                        ${platformLabel}
                    </div>
                </div>
                
                <div class="game-progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill ${percentage < 6 ? 'low-percentage' : ''}" style="width: ${percentage}%">${percentage}%</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Detail view
export function showGameDetail(appId, updateUrl = true) {
    const game = gamesData.get(appId);
    if (!game) return;

    // Only update URL if not called from handleDeepLink or popstate
    if (updateUrl) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('game', appId);
        window.history.pushState({ appId }, '', newUrl);
    }

    const unlocked = game.achievements.filter(a => a.unlocked).length;
    const total = game.achievements.length;
    const percentage = calculatePercentage(unlocked, total);

    window.currentGameData = {
        appId: appId,
        game: game,
        unlocked: unlocked,
        total: total,
        percentage: percentage,
        sortMode: 'default',
        compareMode: false,
        comparisonData: null
    };

    renderGameDetail();
}

export function renderGameDetail() {
    const { appId, game, unlocked, total, percentage, sortMode, compareMode } = window.currentGameData;

    document.getElementById('games-grid').classList.add('hidden');
    document.getElementById('summary-box').classList.add('hidden');
    document.getElementById('grid-sort-controls').classList.add('hidden');
    
    // Hide search bar in detail view
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) searchContainer.classList.add('hidden');

    const detailView = document.getElementById('detail-view');
    
    if (compareMode) {
        detailView.innerHTML = renderDetailViewWithComparison(game, unlocked, total, percentage);
    } else {
        detailView.innerHTML = renderDetailViewNormal(game, unlocked, total, percentage, sortMode);
    }
    
    detailView.classList.add('active');
    window.scrollTo(0, 0);

    // Setup comparison filters if in compare mode
    if (compareMode) {
        setupComparisonFilters();
    }
}

// Normal view with Unlocked/Locked Categories
function renderDetailViewNormal(game, unlocked, total, percentage, sortMode) {
    // Clone achievements to avoid modifying the original array during sort
    let achievements = [...game.achievements];

    // Apply sorting first
    if (sortMode === 'rarity-asc') {
        achievements.sort((a, b) => {
            const rarityA = a.rarity !== null ? parseFloat(a.rarity) : 999;
            const rarityB = b.rarity !== null ? parseFloat(b.rarity) : 999;
            return rarityA - rarityB;
        });
    } else if (sortMode === 'rarity-desc') {
        achievements.sort((a, b) => {
            const rarityA = a.rarity !== null ? parseFloat(a.rarity) : -1;
            const rarityB = b.rarity !== null ? parseFloat(b.rarity) : -1;
            return rarityB - rarityA;
        });
    } else if (sortMode === 'date-newest') {
        achievements.sort((a, b) => (b.unlocktime || 0) - (a.unlocktime || 0));
    } else if (sortMode === 'date-oldest') {
        achievements.sort((a, b) => (a.unlocktime || 0) - (b.unlocktime || 0));
    } else if (sortMode === 'group-base-first') {
        // Sort by Group: Base Game First
        achievements.sort((a, b) => {
            const groupA = a.group || 'Base Game';
            const groupB = b.group || 'Base Game';

            if (groupA === 'Base Game' && groupB !== 'Base Game') return -1;
            if (groupB === 'Base Game' && groupA !== 'Base Game') return 1;

            const groupCompare = groupA.localeCompare(groupB);
            if (groupCompare !== 0) return groupCompare;

            return a.name.localeCompare(b.name);
        });
    } else if (sortMode === 'group-dlc-first') {
        // Sort by Group: DLCs First
        achievements.sort((a, b) => {
            const groupA = a.group || 'Base Game';
            const groupB = b.group || 'Base Game';

            if (groupA === 'Base Game' && groupB !== 'Base Game') return 1;
            if (groupB === 'Base Game' && groupA !== 'Base Game') return -1;

            const groupCompare = groupA.localeCompare(groupB);
            if (groupCompare !== 0) return groupCompare;

            return a.name.localeCompare(b.name);
        });
    }

    // Split achievements into Unlocked and Locked
    const unlockedAchievements = achievements.filter(a => a.unlocked);
    const lockedAchievements = achievements.filter(a => !a.unlocked);

    let achievementsHTML = '';

    if (unlockedAchievements.length > 0) {
        achievementsHTML += `
            <h3 class="achievements-section-title">Unlocked Achievements (${unlockedAchievements.length})</h3>
            ${unlockedAchievements.map(ach => renderAchievement(ach, true)).join('')}
        `;
    }

    if (lockedAchievements.length > 0) {
        achievementsHTML += `
            <h3 class="achievements-section-title locked-title">Locked Achievements (${lockedAchievements.length})</h3>
            ${lockedAchievements.map(ach => renderAchievement(ach, false)).join('')}
        `;
    }

    // Check for "Passport" (Visitor) from URL
    const visitor = getVisitorUsername();
    
    // Show compare button ONLY if we have a visitor username in URL AND it's not the own profile
    const compareButton = (visitor && !isOwnProfile()) ? `
        <button class="compare-button" onclick="window.enableCompareMode()">
            🔄 Compare Achievements
        </button>
    ` : '';

    return `
        <button class="back-button" onclick="window.hideGameDetail()">
            ← Back to All Games
        </button>
        
        <div class="detail-header">
            ${game.icon ? 
                `<img src="${game.icon}" alt="${game.name}" class="detail-game-icon" onerror="this.src='https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image'">` : 
                `<img src="https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image" class="detail-game-icon">`}
            <div class="detail-game-info">
                <div class="detail-game-title">${game.name}</div>
                <div class="detail-game-appid">AppID: ${game.appId}</div>
                
                <div class="progress-bar">
                    <div class="progress-fill ${percentage < 6 ? 'low-percentage' : ''}" style="width: ${percentage}%">${percentage}%</div>
                </div>
                
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value">${unlocked}/${total}</div>
                        <div class="stat-label">Unlocked</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${total - unlocked}</div>
                        <div class="stat-label">Remaining</div>
                    </div>
                </div>
                
                ${compareButton}
            </div>
        </div>
        
        <div class="achievements-list">
            <div class="sort-controls">
                <button class="sort-button ${sortMode === 'rarity-asc' ? 'active' : ''}" onclick="window.setSortMode('rarity-asc')" data-tooltip="Rarest First">
                    🏆↑
                </button>
                <button class="sort-button ${sortMode === 'rarity-desc' ? 'active' : ''}" onclick="window.setSortMode('rarity-desc')" data-tooltip="Most Common First">
                    🏆↓
                </button>
                <button class="sort-button ${sortMode === 'date-newest' ? 'active' : ''}" onclick="window.setSortMode('date-newest')" data-tooltip="Newest First">
                    🕐↓
                </button>
                <button class="sort-button ${sortMode === 'date-oldest' ? 'active' : ''}" onclick="window.setSortMode('date-oldest')" data-tooltip="Oldest First">
                    🕐↑
                </button>
                
                <button class="sort-button ${sortMode === 'group-base-first' ? 'active' : ''}" onclick="window.setSortMode('group-base-first')" data-tooltip="Base Game First">
                    📥↓
                </button>
                <button class="sort-button ${sortMode === 'group-dlc-first' ? 'active' : ''}" onclick="window.setSortMode('group-dlc-first')" data-tooltip="Extra Content First">
                    📥↑
                </button>

                ${sortMode !== 'default' ? `<button class="sort-button" onclick="window.setSortMode('default')" data-tooltip="Reset Sorting">↺</button>` : ''}
            </div>

            ${achievementsHTML}
        </div>
    `;
}

// Comparison view
function renderDetailViewWithComparison(game, unlocked, total, percentage) {
    const { comparisonData } = window.currentGameData;
    const theirUsername = window.githubUsername || window.location.href.split('.github.io')[0].split('//')[1];
    
    return `
        <button class="back-button" onclick="window.hideGameDetail()">
            ← Back to All Games
        </button>
        
        <div class="detail-header">
            ${game.icon ? 
                `<img src="${game.icon}" alt="${game.name}" class="detail-game-icon" onerror="this.src='https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image'">` : 
                `<img src="https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image" class="detail-game-icon">`}
            <div class="detail-game-info">
                <div class="detail-game-title">${game.name}</div>
                <div class="detail-game-appid">AppID: ${game.appId}</div>
                
                <div class="compare-mode-toggle">
                    <button class="toggle-btn" onclick="window.disableCompareMode()">
                        📋 Normal View
                    </button>
                    <button class="toggle-btn active">
                        🔄 Comparison
                    </button>
                </div>
            </div>
        </div>
        
        ${comparisonData ? renderComparisonView(game, comparisonData, theirUsername) : '<div class="loading">Loading comparison data...</div>'}
    `;
}

function renderAchievement(ach, isUnlocked) {
    const rarityNum = ach.rarity !== null && ach.rarity !== undefined ? parseFloat(ach.rarity) : null;
    const isRare = rarityNum !== null && !isNaN(rarityNum) && rarityNum < 10;
    
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

    // DLC / Group Label Logic (SteamDB style)
    let groupHTML = '';
    if (ach.group && ach.group !== 'Base Game') {
        groupHTML = `<div class="achievement-group">${ach.group}</div>`;
    }

    return `
        <div class="achievement ${isUnlocked ? 'unlocked' : 'locked'}">
            ${ach.icon || ach.icongray ? 
                `<img src="${isUnlocked ? ach.icon : (ach.icongray || ach.icon)}" alt="${ach.name}" class="achievement-icon ${isRare ? 'rare-glow' : ''}" onerror="this.style.display='none'">` : 
                `<div class="achievement-icon ${isRare ? 'rare-glow' : ''}"></div>`}
            <div class="achievement-info">
                <div class="achievement-name">${ach.name}</div>
                ${descriptionHTML}
                ${groupHTML}
                ${isUnlocked && ach.unlocktime ? 
                    `<div class="achievement-unlock-time">Unlocked: ${formatUnlockDate(ach.unlocktime)}</div>` : 
                    ''}
                ${rarityNum !== null && !isNaN(rarityNum) ? 
                    `<div class="achievement-rarity ${isRare ? 'rarity-rare' : ''}">${rarityNum.toFixed(1)}% of players have this</div>` : 
                    ''}
            </div>
        </div>
    `;
}

export function hideGameDetail() {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('game');
    // Keep 'vs' parameter if present
    const vs = new URLSearchParams(window.location.search).get('vs');
    if (vs) newUrl.searchParams.set('vs', vs);
    
    window.history.pushState({}, '', newUrl);

    document.getElementById('detail-view').classList.remove('active');
    document.getElementById('games-grid').classList.remove('hidden');
    document.getElementById('summary-box').classList.remove('hidden');
    document.getElementById('grid-sort-controls').classList.remove('hidden');
    
    // Show search bar when returning to grid
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) searchContainer.classList.remove('hidden');

    window.scrollTo(0, 0);
}

export function setSortMode(mode) {
    window.currentGameData.sortMode = mode;
    renderGameDetail();
}

export function setGridSortMode(mode) {
    window.gridSortMode = mode;
    displayGames();
}

export function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const appId = params.get('game');
    const vsUser = params.get('vs');

    if (appId && gamesData.has(appId)) {
        showGameDetail(appId, false);

        // If 'vs' parameter is present, automatically enable comparison mode
        if (vsUser) {
            window.enableCompareMode();
        }
    }
}

// Enable comparison mode
window.enableCompareMode = async function() {
    const { appId, game } = window.currentGameData;
    
    // 1. Check if we have a visitor user (URL param)
    const storedUser = getVisitorUsername();
    
    // 2. Security Check: If no user is in URL (Guest), abort.
    if (!storedUser) {
        return;
    }
    
    // 3. Proceed immediately to loading
    window.currentGameData.compareMode = true;
    renderGameDetail(); // Shows the view (loading state)
    
    // Load data
    const ownData = await loadOwnGameData(appId);
    const comparisonData = compareAchievements(game, ownData);
    
    window.currentGameData.comparisonData = comparisonData;
    renderGameDetail(); // Renders the final results
};

// Disable comparison mode
window.disableCompareMode = function() {
    window.currentGameData.compareMode = false;
    window.currentGameData.comparisonData = null;
    renderGameDetail();
};

// Adjust card heights dynamically
function adjustCardHeights() {
    // Check if ANY game card has a platform label with content
    const allGameCards = document.querySelectorAll('.game-card');
    let hasPlatformLabel = false;
    
    allGameCards.forEach(card => {
        const platformLabel = card.querySelector('.game-source');
        if (platformLabel && platformLabel.textContent.trim() !== '') {
            hasPlatformLabel = true;
        }
    });
    
    // Apply the uniform-height class only if at least one card has a platform
    if (hasPlatformLabel) {
        allGameCards.forEach(card => {
            card.classList.add('uniform-height');
        });
    } else {
        allGameCards.forEach(card => {
            card.classList.remove('uniform-height');
        });
    }
}
