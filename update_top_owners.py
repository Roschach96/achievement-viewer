import requests
from bs4 import BeautifulSoup
import re
import json
from pathlib import Path

print("Updating TOP_OWNER_IDS from steamladder.com...")

try:
    URL = "https://steamladder.com/ladder/games/"
    response = requests.get(URL, timeout=15)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    steam_ids = []
    for a in soup.select('a[href^="/profile/"]'):
        m = re.search(r"/profile/(\d{17})", a.get("href", ""))
        if m:
            steam_id = int(m.group(1))
            if steam_id not in steam_ids:
                steam_ids.append(steam_id)

    steam_ids = steam_ids[:32]  # Top 32 users

    if len(steam_ids) >= 10:
        # Write to top_owners.json
        with open("top_owners.json", "w", encoding="utf-8") as f:
            json.dump(
                {"steam_ids": steam_ids, "updated": "Auto-updated by GitHub Actions"},
                f,
                indent=2,
            )

        print(f"✓ Updated top_owners.json with {len(steam_ids)} Steam IDs")
    else:
        print(f"✗ Not enough Steam IDs found ({len(steam_ids)}), keeping old list")

except Exception as e:
    print(f"✗ Error updating TOP_OWNER_IDS: {e}")
    print("Keeping old list")
