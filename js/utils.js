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