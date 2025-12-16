import os
import json
import requests
from pathlib import Path
import time
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import subprocess
import re

STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")
EVENT_NAME = os.environ.get("GITHUB_EVENT_NAME", "")

# Load TOP_OWNER_IDS from external file
top_owners_file = Path("top_owners.json")
if top_owners_file.exists():
    try:
        with open(top_owners_file, "r", encoding="utf-8") as f:
            top_owners_data = json.load(f)
            TOP_OWNER_IDS = top_owners_data.get("steam_ids", [])
        print(f"Loaded {len(TOP_OWNER_IDS)} Steam IDs from top_owners.json")
    except Exception as e:
        print(f"Error loading top_owners.json: {e}")
        # Fallback to default list
        TOP_OWNER_IDS = [
            76561198028121353,
            76561197979911851,
            76561198017975643,
            76561197993544755,
            76561198355953202,
            76561198001237877,
            76561198237402290,
            76561198152618007,
            76561198355625888,
            76561198213148949,
            76561197969050296,
            76561198217186687,
            76561198037867621,
            76561198094227663,
            76561198019712127,
            76561197963550511,
            76561198134044398,
            76561198001678750,
            76561197973009892,
            76561198044596404,
            76561197976597747,
            76561197969810632,
            76561198095049646,
            76561198085065107,
            76561198864213876,
            76561197962473290,
            76561198388522904,
            76561198033715344,
            76561197995070100,
            76561198313790296,
            76561198063574735,
            76561197996432822,
        ]
else:
    # Default list if file doesn't exist
    TOP_OWNER_IDS = [
        76561198028121353,
        76561197979911851,
        76561198017975643,
        76561197993544755,
        76561198355953202,
        76561198001237877,
        76561198237402290,
        76561198152618007,
        76561198355625888,
        76561198213148949,
        76561197969050296,
        76561198217186687,
        76561198037867621,
        76561198094227663,
        76561198019712127,
        76561197963550511,
        76561198134044398,
        76561198001678750,
        76561197973009892,
        76561198044596404,
        76561197976597747,
        76561197969810632,
        76561198095049646,
        76561198085065107,
        76561198864213876,
        76561197962473290,
        76561198388522904,
        76561198033715344,
        76561197995070100,
        76561198313790296,
        76561198063574735,
        76561197996432822,
    ]


def get_changed_appids():
    """Get list of AppIDs that were modified in the last push"""
    try:
        # Get changed files from git
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        changed_files = result.stdout.strip().split("\n")

        # Extract AppIDs from changed achievements files
        changed_appids = set()
        for file in changed_files:
            # Match pattern: AppID/123456/achievements.json or AppID/123456/123456.db
            match = re.match(r"AppID/(\d+)/(achievements\.json|\d+\.db)", file)
            if match:
                changed_appids.add(match.group(1))

        return list(changed_appids)
    except Exception as e:
        print(f"Error getting changed files: {e}")
        return []


appid_dir = Path("AppID")
if not appid_dir.exists():
    print("No AppID directory found")
    exit(0)


def load_achievements_file(folder):
    """Load achievements from either .json or {appid}.db file"""
    appid = folder.name

    # Try achievements.json first
    json_file = folder / "achievements.json"
    if json_file.exists():
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Check if it's already in the right format (dict with apiname keys)
            if isinstance(data, dict):
                return data, "json"
            # If it's a list (like .db format), convert it
            elif isinstance(data, list):
                converted = {}
                for ach in data:
                    if "apiname" in ach:
                        converted[ach["apiname"]] = {
                            "earned": ach.get("achieved", 0) == 1,
                            "earned_time": ach.get("unlocktime", 0),
                        }
                return converted, "json-list"
        except Exception as e:
            print(f"    Error loading {json_file}: {e}")

    # Try {appid}.db
    db_file = folder / f"{appid}.db"
    if db_file.exists():
        try:
            with open(db_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Convert list format to dict format
            converted = {}
            for ach in data:
                if "apiname" in ach:
                    converted[ach["apiname"]] = {
                        "earned": ach.get("achieved", 0) == 1,
                        "earned_time": ach.get("unlocktime", 0),
                    }
            return converted, f"{appid}.db"
        except Exception as e:
            print(f"    Error loading {db_file}: {e}")

    return None, None


# Determine which AppIDs to process
if EVENT_NAME == "push":
    # Only process changed files
    appids = get_changed_appids()
    if appids:
        print(f"Processing {len(appids)} changed game(s): {', '.join(appids)}")
    else:
        print("No achievements files were changed in this push")
        exit(0)
else:
    # Process all AppIDs (scheduled run or manual trigger)
    appids = []
    for folder in appid_dir.iterdir():
        if folder.is_dir() and folder.name.isdigit():
            # Check for either file type
            appid = folder.name
            if (folder / "achievements.json").exists() or (
                folder / f"{appid}.db"
            ).exists():
                appids.append(appid)
    print(f"Processing all {len(appids)} games (scheduled/manual run)")

# Load existing game-data.json if it exists
game_data_path = Path("game-data.json")
existing_game_data = {}
if game_data_path.exists():
    try:
        with open(game_data_path, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
            # Convert to dict for easier lookup
            for game in existing_data:
                existing_game_data[game["appid"]] = game
        print(f"Loaded existing data for {len(existing_game_data)} games")
    except Exception as e:
        print(f"Could not load existing game-data.json: {e}")


def scrape_hidden_achievements(appid, steam_id, achievement_names_map):
    """Scrape hidden achievement descriptions from profile page"""
    try:
        url = (
            f"https://steamcommunity.com/profiles/{steam_id}/stats/{appid}/achievements"
        )
        print(f"    → Trying profile {steam_id}...")
        response = requests.get(url, timeout=15)

        if response.status_code != 200:
            print(f"    ✗ Profile returned status {response.status_code}")
            return {}

        soup = BeautifulSoup(response.text, "html.parser")
        achievements = {}

        achieve_rows = soup.find_all("div", class_="achieveRow")
        if not achieve_rows:
            print(f"    ✗ No achievement data found")
            return {}

        print(f"    → Found {len(achieve_rows)} achievements on page")

        for row in achieve_rows:
            try:
                name_elem = row.find("h3")
                if not name_elem:
                    continue

                display_name = name_elem.text.strip()

                desc_elem = row.find("h5")
                if not desc_elem:
                    continue

                description = desc_elem.text.strip()
                if not description:
                    continue

                api_name = achievement_names_map.get(display_name.lower())

                if api_name:
                    achievements[api_name] = {
                        "name": display_name,
                        "description": description,
                    }

            except Exception as e:
                continue

        if achievements:
            print(f"    ✓ Matched {len(achievements)} achievement API names")

        return achievements

    except Exception as e:
        print(f"    ✗ Error: {e}")
        return {}


# Process only the selected AppIDs
for appid in appids:
    print(f"\nProcessing AppID {appid}...")

    game_info = {
        "appid": appid,
        "name": f"Game {appid}",
        "icon": "",
        "achievements": {},
    }

    # Check if .db file exists
    db_file_path = Path(f"AppID/{appid}/{appid}.db")
    uses_db_file = db_file_path.exists()

    # Check for .platform file
    platform = None
    for file in Path(f"AppID/{appid}").glob("*.platform"):
        platform = (
            file.stem
        )  # Get filename without extension (e.g., "Epic" from "Epic.platform")
        break

    # Load blacklist if exists
    blacklist = []
    blacklist_file = Path(f"AppID/{appid}/blacklist")
    if blacklist_file.exists():
        try:
            with open(blacklist_file, "r", encoding="utf-8") as f:
                blacklist = [line.strip() for line in f if line.strip()]
            print(f"  → Loaded {len(blacklist)} blacklisted achievements")
        except Exception as e:
            print(f"  ✗ Error loading blacklist: {e}")

    try:
        # Fetch from Steam Store API
        store_url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
        store_response = requests.get(store_url, timeout=10)

        if store_response.ok:
            store_data = store_response.json()
            if appid in store_data and store_data[appid].get("success"):
                data = store_data[appid]["data"]
                game_info["name"] = data.get("name", f"Game {appid}")
                game_info["icon"] = data.get("header_image", "")
                print(f"  ✓ Got game info: {game_info['name']}")

        time.sleep(1.5)

        # Fetch from Community XML
        xml_url = f"https://steamcommunity.com/stats/{appid}/achievements/?xml=1"
        xml_response = requests.get(xml_url, timeout=10)

        achievements_from_xml = {}
        if xml_response.ok:
            try:
                root = ET.fromstring(xml_response.content)
                for ach in root.findall(".//achievement"):
                    icon_closed = ach.find("iconClosed")
                    icon_open = ach.find("iconOpen")
                    name_elem = ach.find("name")
                    desc_elem = ach.find("description")
                    api_name = ach.find("apiname")

                    if api_name is not None and api_name.text:
                        ach_name = (
                            name_elem.text
                            if name_elem is not None and name_elem.text
                            else ""
                        )
                        ach_desc = (
                            desc_elem.text
                            if desc_elem is not None and desc_elem.text
                            else ""
                        )

                        ach_data = {
                            "name": ach_name,
                            "description": ach_desc,
                            "icon": (
                                icon_open.text
                                if icon_open is not None and icon_open.text
                                else ""
                            ),
                            "icongray": (
                                icon_closed.text
                                if icon_closed is not None and icon_closed.text
                                else ""
                            ),
                            "hidden": False,
                        }
                        achievements_from_xml[api_name.text] = ach_data

                print(f"  ✓ Got {len(achievements_from_xml)} achievements from XML")
            except ET.ParseError as e:
                print(f"  ✗ XML parse error: {e}")

        time.sleep(1.5)

        # Fetch achievement schema from API
        hidden_achievements = []
        achievement_names_map = {}

        if STEAM_API_KEY:
            schema_url = f"https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={STEAM_API_KEY}&appid={appid}"
            schema_response = requests.get(schema_url, timeout=10)

            if schema_response.ok:
                schema_data = schema_response.json()
                achievements = (
                    schema_data.get("game", {})
                    .get("availableGameStats", {})
                    .get("achievements", [])
                )

                for ach in achievements:
                    api_name = ach["name"]
                    is_hidden = ach.get("hidden", 0) == 1
                    display_name = ach.get("displayName", ach["name"])

                    achievement_names_map[display_name.lower()] = api_name

                    if api_name in achievements_from_xml:
                        game_info["achievements"][api_name] = achievements_from_xml[
                            api_name
                        ].copy()
                        game_info["achievements"][api_name]["hidden"] = is_hidden

                        if (
                            is_hidden
                            and not game_info["achievements"][api_name]["description"]
                        ):
                            hidden_achievements.append(api_name)
                    else:
                        game_info["achievements"][api_name] = {
                            "name": display_name,
                            "description": ach.get("description", ""),
                            "icon": ach.get("icon", ""),
                            "icongray": ach.get("icongray", ""),
                            "hidden": is_hidden,
                        }
                        if is_hidden and not ach.get("description"):
                            hidden_achievements.append(api_name)

                print(f"  ✓ Merged {len(achievements)} achievements")

                # Scrape for hidden achievements
                if hidden_achievements:
                    print(
                        f"  → Found {len(hidden_achievements)} hidden achievements without descriptions"
                    )
                    print(f"  → Scraping profile pages...")

                    profiles_tried = 0
                    descriptions_found = 0

                    for steam_id in TOP_OWNER_IDS[:20]:
                        profiles_tried += 1
                        scraped = scrape_hidden_achievements(
                            appid, steam_id, achievement_names_map
                        )

                        if scraped:
                            for api_name, data in scraped.items():
                                if api_name in game_info["achievements"]:
                                    if not game_info["achievements"][api_name][
                                        "description"
                                    ]:
                                        game_info["achievements"][api_name][
                                            "description"
                                        ] = data["description"]
                                        descriptions_found += 1
                                        print(
                                            f"    ✓ Found: '{data['name']}' -> '{data['description'][:50]}...'"
                                        )

                            missing = sum(
                                1
                                for api_name in hidden_achievements
                                if not game_info["achievements"][api_name][
                                    "description"
                                ]
                            )

                            print(
                                f"    → Progress: {descriptions_found}/{len(hidden_achievements)} found, {missing} missing"
                            )

                            if missing == 0:
                                print(
                                    f"  ✓ Got all hidden descriptions from {profiles_tried} profiles!"
                                )
                                break

                        time.sleep(2)

                    final_missing = sum(
                        1
                        for api_name in hidden_achievements
                        if not game_info["achievements"][api_name]["description"]
                    )

                    if final_missing > 0:
                        print(
                            f"  ! Still missing {final_missing} descriptions after {profiles_tried} profiles"
                        )
                    else:
                        print(
                            f"  ✓ All {len(hidden_achievements)} hidden descriptions found!"
                        )

            time.sleep(1.5)

            # Fetch percentages
            percent_url = f"https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={appid}"
            percent_response = requests.get(percent_url, timeout=10)

            if percent_response.ok:
                percent_data = percent_response.json()
                percentages = percent_data.get("achievementpercentages", {}).get(
                    "achievements", []
                )

                for ach_percent in percentages:
                    ach_name = ach_percent.get("name")
                    if ach_name in game_info["achievements"]:
                        game_info["achievements"][ach_name]["percent"] = (
                            ach_percent.get("percent", 0)
                        )

                print(f"  ✓ Got percentages")

            time.sleep(1.5)

    except Exception as e:
        print(f"  ✗ Error: {e}")
        import traceback

        traceback.print_exc()

    # Save individual game-info.json
    game_info_path = Path(f"AppID/{appid}/game-info.json")
    game_info["uses_db"] = uses_db_file
    game_info["platform"] = platform
    game_info["blacklist"] = blacklist
    with open(game_info_path, "w", encoding="utf-8") as f:
        json.dump(game_info, f, indent=2, ensure_ascii=False)

    # Load achievements data
    folder = Path(f"AppID/{appid}")
    achievements_data, file_type = load_achievements_file(folder)

    if achievements_data is None:
        print(f"  ✗ No achievements file found for {appid}")
        continue

    print(f"  ✓ Loaded achievements from {file_type} format")

    # Ensure appid is a string for consistency
    appid_str = str(appid)

    # Update existing game data dict
    existing_game_data[appid_str] = {
        "appid": appid_str,
        "info": game_info,
        "achievements": achievements_data,
    }

# Rebuild complete game-data.json from all games in AppID directory
all_game_data = []
for folder in appid_dir.iterdir():
    if folder.is_dir() and folder.name.isdigit():
        current_appid = str(folder.name)  # Ensure it's a string

        # Check if achievements file exists
        achievements_data, file_type = load_achievements_file(folder)
        if achievements_data is None:
            continue

        # Use updated data if we just processed it, otherwise use existing
        if current_appid in existing_game_data:
            all_game_data.append(existing_game_data[current_appid])
        else:
            # Load from files if not in memory
            try:
                game_info_file = folder / "game-info.json"
                if game_info_file.exists():
                    with open(game_info_file, "r", encoding="utf-8") as f:
                        info_data = json.load(f)
                else:
                    info_data = {
                        "appid": current_appid,
                        "name": f"Game {current_appid}",
                        "icon": "",
                        "achievements": {},
                    }

                all_game_data.append(
                    {
                        "appid": current_appid,
                        "info": info_data,
                        "achievements": achievements_data,
                    }
                )
            except Exception as e:
                print(f"Error loading data for {current_appid}: {e}")

# Write complete game-data.json
with open("game-data.json", "w", encoding="utf-8") as f:
    json.dump(all_game_data, f, indent=2, ensure_ascii=False)

print(f"\n✓ Updated {len(appids)} game(s), total games in data: {len(all_game_data)}")
