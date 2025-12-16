const fetchJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null));

function detectRepo() {
  const host = location.hostname;
  const path = location.pathname.split('/').filter(Boolean);
  if (!host.endsWith('.github.io') || path.length === 0) return { owner: 'darktakayanagi', repo: 'achievement-viewer' };
  return { owner: host.replace('.github.io', ''), repo: path[0] };
}

async function resolveRootRepo(owner, repo) {
  const info = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
  if (!info) throw new Error('Repo not found');

  if (info.fork && info.parent) {
    return { owner: info.parent.owner.login, repo: info.parent.name };
  }
  return { owner, repo };
}

async function fetchAllForks(owner, repo, processed = new Set()) {
  const key = `${owner}/${repo}`;
  if (processed.has(key)) return [];
  processed.add(key);

  let forks = [];
  let page = 1;
  while (true) {
    const data = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/forks?per_page=100&page=${page}`);
    if (!data || !data.length) break;
    forks.push(...data);
    page++;
  }

  // Recurse into forks of forks
  for (const f of forks) {
    const sub = await fetchAllForks(f.owner.login, f.name, processed);
    forks.push(...sub);
  }

  return forks;
}

async function loadGameData(person) {
  const url = `https://raw.githubusercontent.com/${person.login}/${person.repo || 'achievement-viewer'}/main/game-data.json`;
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
    // Get blacklist from info if available
    const blacklist = g.info?.blacklist || [];
    
    // Get all achievement keys
    const allAchKeys = Object.keys(g.achievements);
    
    // Filter out blacklisted achievements
    const validAchKeys = allAchKeys.filter(key => !blacklist.includes(key));
    
    // Count earned achievements (excluding blacklisted)
    let earnedCount = 0;
    for (const key of validAchKeys) {
      const ach = g.achievements[key];
      // Handle both boolean and numeric earned values
      if (ach.earned === true || ach.earned === 1) {
        earnedCount++;
      }
    }
    
    const totalCount = validAchKeys.length;
    
    earnedAchievements += earnedCount;
    totalAchievements += totalCount;
    
    // Check if it's a perfect game
    if (totalCount > 0 && earnedCount === totalCount) {
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
    const url = `https://${person.login}.github.io/${person.repo || 'achievement-viewer'}/`;
    
    // Left click (button 0) or middle click (button 1)
    if (e.button === 0) {
      window.open(url, '_blank');
    } else if (e.button === 1) {
      e.preventDefault(); // Prevent default middle-click behavior
      window.open(url, '_blank');
    }
  });
  
  // Prevent context menu on right-click for cleaner UX
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

(async () => {
  const current = detectRepo();
  if (!current) return;

  const root = await resolveRootRepo(current.owner, current.repo);

  // Main repo user
  const mainUser = {
    login: root.owner,
    avatar: (await fetchJSON(`https://api.github.com/users/${root.owner}`)).avatar_url,
    original: true,
    repo: root.repo,
  };
  addUserToGrid(mainUser);

  // Fetch forks
  const forks = await fetchAllForks(root.owner, root.repo);
  for (const f of forks) {
    addUserToGrid({
      login: f.owner.login,
      avatar: f.owner.avatar_url,
      original: false,
      repo: f.name,
    });
  }

  // Search & sort
  const people = [
    mainUser,
    ...forks.map((f) => ({
      login: f.owner.login,
      avatar: f.owner.avatar_url,
      original: false,
      repo: f.name,
    })),
  ];

  document.getElementById('search').addEventListener('input', () => renderFiltered(people));
  document.getElementById('sort').addEventListener('change', () => renderFiltered(people));

  function renderFiltered(users) {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const sortMode = document.getElementById('sort').value;

    let filtered = users.filter((u) => u.login.toLowerCase().includes(searchTerm));

    if (sortMode === 'az') filtered.sort((a, b) => a.login.localeCompare(b.login));
    if (sortMode === 'za') filtered.sort((a, b) => b.login.localeCompare(a.login));
    if (sortMode === 'mostAch') filtered.sort((a, b) => b.achievements - a.achievements);
    if (sortMode === 'mostPerfect') filtered.sort((a, b) => b.perfectGames - a.perfectGames);

    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    filtered.forEach(addUserToGrid);
  }
})();
