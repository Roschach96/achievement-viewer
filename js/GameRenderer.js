import { gamesData } from './GameLoader.js';
import { calculatePercentage, formatUnlockDate } from './utils.js';

// Displaying games
export function displayGames() {
    const resultsDiv = document.getElementById('results');
    const summaryDiv = document.getElementById('summary');

    document.getElementById('loading').style.display = 'none';

    if (gamesData.size === 0) {
        resultsDiv.innerHTML = '<div class="error">No games with achievements found.</div>';
        return;
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
                        <span style="text-transform: capitalize;">${window.githubUsername}</span>'s summary
                    </h2>
                </div>

                ${gamerCard ? `
                <div class="gamer-card-container">
                    ${gamerCard}
                </div>
                ` : ''}
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
    const sortControlsHTML = `
        <div class="grid-sort-controls" id="grid-sort-controls">
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
        </div>
    `;

    let html = '<div class="games-grid" id="games-grid">';
    
    const sortedGames = sortGames(window.gridSortMode || 'percentage');

    for (let game of sortedGames) {
        const unlocked = game.achievements.filter(a => a.unlocked).length;
        const total = game.achievements.length;
        const percentage = calculatePercentage(unlocked, total);

        html += renderGameCard(game, percentage);
    }

    html += '</div>';
    resultsDiv.innerHTML = sortControlsHTML + html;
}

function sortGames(mode) {
    if (mode === 'recent') {
        return Array.from(gamesData.values()).sort((a, b) => {
            const aMaxTime = Math.max(...a.achievements.filter(ach => ach.unlocked).map(ach => ach.unlocktime || 0));
            const bMaxTime = Math.max(...b.achievements.filter(ach => ach.unlocked).map(ach => ach.unlocktime || 0));
            
            if (aMaxTime === bMaxTime) {
                return a.name.localeCompare(b.name);
            }
            
            return bMaxTime - aMaxTime;
        });
    } else {
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
                        '<img src="https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image" class="game-icon">'}
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

    // Csak akkor frissítjük az URL-t, ha nem a handleDeepLink vagy popstate hívta meg
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
        sortMode: 'default'
    };

    renderGameDetail();
}

export function renderGameDetail() {
    const { appId, game, unlocked, total, percentage, sortMode } = window.currentGameData;

    let unlockedAchievements = game.achievements.filter(a => a.unlocked);
    let lockedAchievements = game.achievements.filter(a => !a.unlocked);

    if (sortMode === 'rarity-asc') {
        unlockedAchievements.sort((a, b) => {
            const rarityA = a.rarity !== null ? parseFloat(a.rarity) : 999;
            const rarityB = b.rarity !== null ? parseFloat(b.rarity) : 999;
            return rarityA - rarityB;
        });
    } else if (sortMode === 'rarity-desc') {
        unlockedAchievements.sort((a, b) => {
            const rarityA = a.rarity !== null ? parseFloat(a.rarity) : -1;
            const rarityB = b.rarity !== null ? parseFloat(b.rarity) : -1;
            return rarityB - rarityA;
        });
    } else if (sortMode === 'date-newest') {
        unlockedAchievements.sort((a, b) => (b.unlocktime || 0) - (a.unlocktime || 0));
    } else if (sortMode === 'date-oldest') {
        unlockedAchievements.sort((a, b) => (a.unlocktime || 0) - (b.unlocktime || 0));
    }

    document.getElementById('games-grid').classList.add('hidden');
    document.getElementById('summary-box').classList.add('hidden');
    document.getElementById('grid-sort-controls').classList.add('hidden');

    const detailView = document.getElementById('detail-view');
    detailView.innerHTML = renderDetailView(game, unlocked, total, percentage, sortMode, unlockedAchievements, lockedAchievements);
    detailView.classList.add('active');
    window.scrollTo(0, 0);
}

function renderDetailView(game, unlocked, total, percentage, sortMode, unlockedAchievements, lockedAchievements) {
    return `
        <button class="back-button" onclick="window.hideGameDetail()">
            ← Back to All Games
        </button>
        
        <div class="detail-header">
            ${game.icon ? 
                `<img src="${game.icon}" alt="${game.name}" class="detail-game-icon" onerror="this.src='https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image'">` : 
                '<img src="https://via.placeholder.com/460x215/3d5a6c/ffffff?text=No+Image" class="detail-game-icon">'}
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
            </div>
        </div>
        
        <div class="achievements-list">
            ${unlockedAchievements.length > 0 ? `
                <h3 class="achievements-section-title">Unlocked Achievements</h3>
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
                    ${sortMode !== 'default' ? `<button class="sort-button" onclick="window.setSortMode('default')" data-tooltip="Reset Sorting">↺</button>` : ''}
                </div>
                ${unlockedAchievements.map(ach => renderAchievement(ach, true)).join('')}
            ` : ''}
            
            ${lockedAchievements.length > 0 ? `
                <h3 class="achievements-section-title locked-title">Locked Achievements</h3>
                ${lockedAchievements.map(ach => renderAchievement(ach, false)).join('')}
            ` : ''}
        </div>
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
    
    return `
        <div class="achievement ${isUnlocked ? 'unlocked' : 'locked'}">
            ${ach.icon || ach.icongray ? 
                `<img src="${isUnlocked ? ach.icon : (ach.icongray || ach.icon)}" alt="${ach.name}" class="achievement-icon ${isRare ? 'rare-glow' : ''}" onerror="this.style.display='none'">` : 
                `<div class="achievement-icon ${isRare ? 'rare-glow' : ''}"></div>`}
            <div class="achievement-info">
                <div class="achievement-name">${ach.name}</div>
                ${descriptionHTML}
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
    window.history.pushState({}, '', newUrl);

    document.getElementById('detail-view').classList.remove('active');
    document.getElementById('games-grid').classList.remove('hidden');
    document.getElementById('summary-box').classList.remove('hidden');
    document.getElementById('grid-sort-controls').classList.remove('hidden');
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
    if (appId && gamesData.has(appId)) {
        showGameDetail(appId, false);
    }
}
