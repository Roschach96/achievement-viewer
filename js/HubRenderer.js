import { detectRepo, resolveRootRepo, fetchAllForks, fetchJSON } from './utils.js';

// Store Hub Owner globally so renderFiltered can use it
let hubOwner = '';

async function loadGameData(person) {
  const url = `https://raw.githubusercontent.com/${person.login}/${person.repo || 'achievement-viewer'}/user/game-data.json`;
  const data = await fetchJSON(url);

  if (!data) {
    person.gameData = [];
    person.achievements = 0;
    person.totalGames = 0;
    person.perfectGames = 0;
    person.totalAchievements = 0;
    return person;
  }

  let earnedAchievements = 0;
  let totalAchievements = 0;
  let perfect = 0;

  for (const g of data) {
    const blacklist = g.info?.blacklist || [];
    
    const hasFullSchema = g.info && 
                         g.info.achievements && 
                         Object.keys(g.info.achievements).length > 0;
    
    let totalCount = 0;
    let earnedCount = 0;
    let canDeterminePerfect = false;
    
    if (hasFullSchema) {
      const schemaKeys = Object.keys(g.info.achievements);
      const validSchemaKeys = schemaKeys.filter(key => !blacklist.includes(key));
      totalCount = validSchemaKeys.length;
      
      for (const key of validSchemaKeys) {
        const userAch = g.achievements[key];
        if (userAch && (userAch.earned === true || userAch.earned === 1)) {
          earnedCount++;
        }
      }
      
      canDeterminePerfect = true;
    } else {
      const saveKeys = Object.keys(g.achievements);
      totalCount = saveKeys.length;
      
      for (const key of saveKeys) {
        const userAch = g.achievements[key];
        if (userAch && (userAch.earned === true || userAch.earned === 1)) {
          earnedCount++;
        }
      }
      
      canDeterminePerfect = false;
    }
    
    earnedAchievements += earnedCount;
    totalAchievements += totalCount;
    
    if (canDeterminePerfect && totalCount > 0 && earnedCount === totalCount) {
      perfect++;
    }
  }

  person.gameData = data;
  person.achievements = earnedAchievements;
  person.totalGames = data.length;
  person.perfectGames = perfect;
  person.totalAchievements = totalAchievements;
  return person;
}

async function addUserToGrid(person) {
  const grid = document.getElementById('grid');

  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = `${grid.children.length * 0.03}s`;
  card.innerHTML = `
    <img class="avatar" src="${person.avatar}">
    <div class="username">${person.login}${person.original ? ' ⭐' : ''}</div>
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width:0%">
          <span>0%</span>
        </div>
      </div>
    </div>
    <div class="stats">Loading…</div>
  `;
  grid.appendChild(card);

  await loadGameData(person);

  const perc = person.totalAchievements ? Math.round((person.achievements / person.totalAchievements) * 100) : 0;

  card.querySelector('.progress-fill').style.width = perc + '%';
  card.querySelector('.progress-fill span').textContent = perc + '%';
  card.querySelector('.stats').innerHTML = `
    ${person.achievements} achievements<br>
    ${person.perfectGames} / ${person.totalGames} perfect games
  `;

  card.addEventListener('mousedown', (e) => {
    // Check if clicking on own profile (hub owner)
    const isOwnProfile = person.login.toLowerCase() === hubOwner.toLowerCase();
    
    let url = `https://${person.login}.github.io/${person.repo || 'achievement-viewer'}/`;
    
    // Only append passport if NOT clicking on own profile
    if (!isOwnProfile && hubOwner) {
      url += `?vs=${hubOwner}`;
    }

    if (e.button === 0 || e.button === 1) {
      if (e.button === 1) e.preventDefault();
      window.open(url, '_blank');
    }
  });
  
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

// Store all users globally so we can re-render on sort/search
let allUsers = [];

function renderFiltered() {
  const searchTerm = document.getElementById('search').value.toLowerCase();
  const sortMode = document.getElementById('sort').value;

  let filtered = allUsers.filter((u) => u.login.toLowerCase().includes(searchTerm));

  // Sort the filtered list
  if (sortMode === 'default') {
    // Do nothing
  } else if (sortMode === 'az') {
    filtered.sort((a, b) => a.login.localeCompare(b.login));
  } else if (sortMode === 'za') {
    filtered.sort((a, b) => b.login.localeCompare(a.login));
  } else if (sortMode === 'mostAch') {
    filtered.sort((a, b) => (b.achievements || 0) - (a.achievements || 0));
  } else if (sortMode === 'mostPerfect') {
    filtered.sort((a, b) => (b.perfectGames || 0) - (a.perfectGames || 0));
  }

  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  
  filtered.forEach((user, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = `${index * 0.03}s`;
    
    const perc = user.totalAchievements ? Math.round((user.achievements / user.totalAchievements) * 100) : 0;
    
    card.innerHTML = `
      <img class="avatar" src="${user.avatar}">
      <div class="username">${user.login}${user.original ? ' ⭐' : ''}</div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width:${perc}%">
            <span>${perc}%</span>
          </div>
        </div>
      </div>
      <div class="stats">
        ${user.achievements || 0} achievements<br>
        ${user.perfectGames || 0} / ${user.totalGames || 0} perfect games
      </div>
    `;
    
    card.addEventListener('mousedown', (e) => {
      // Check if clicking on own profile (hub owner)
      const isOwnProfile = user.login.toLowerCase() === hubOwner.toLowerCase();
      
      let url = `https://${user.login}.github.io/${user.repo || 'achievement-viewer'}/`;
      
      // Only append passport if NOT clicking on own profile
      if (!isOwnProfile && hubOwner) {
        url += `?vs=${hubOwner}`;
      }

      if (e.button === 0 || e.button === 1) {
        if (e.button === 1) e.preventDefault();
        window.open(url, '_blank');
      }
    });
    
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    
    grid.appendChild(card);
  });
}

(async () => {
  const current = detectRepo();
  if (!current) return;

  const root = await resolveRootRepo(current.owner, current.repo);
  
  // ✅ SET HUB OWNER: This is the user "we opened the hub from originally"
  hubOwner = root.owner;

  // Main repo user
  const mainUser = {
    login: root.owner,
    avatar: `https://github.com/${root.owner}.png`,
    original: true,
    repo: root.repo,
  };
  
  // Load main user data first
  await addUserToGrid(mainUser);
  allUsers.push(mainUser);

  // Fetch forks
  const forks = await fetchAllForks(root.owner, root.repo);
  
  // Load all fork users
  for (const f of forks) {
    const forkUser = {
      login: f.owner.login,
      avatar: `https://github.com/${f.owner.login}.png`,
      original: false,
      repo: f.name,
    };
    await addUserToGrid(forkUser);
    allUsers.push(forkUser);
  }

  // Apply initial sort (default to A→Z)
  renderFiltered();

  // Setup event listeners
  document.getElementById('search').addEventListener('input', renderFiltered);
  document.getElementById('sort').addEventListener('change', renderFiltered);
})();