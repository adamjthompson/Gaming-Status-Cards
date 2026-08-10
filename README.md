# Gaming Status Cards for Home Assistant

A collection of beautiful, highly customizable dashboard cards designed specifically to work with the **[Gaming Status Integration](https://github.com/adamjthompson/Gaming-Status)**.

This plugin includes twelve unique cards to visualize (and manage) your squad's gaming habits: a clean **List Card**, a dynamic CSS-animated **Slideshow Card**, a **Weekly Activity Card** stacked by player or by game, a platform **Platforms Card**, a **Leaderboard Card**, a **Recent Activity Card** covering both play sessions and achievement/trophy unlocks (as a table or an icon grid), a **Game Management Card** for cleaning up mislabeled or unwanted history, a **PlayStation Trophies Card**, a **Completion Tracker Card** for 100%-complete or near-complete games, a **Stats Card**, a **Library Card**, and an Exophase-style **Gamercard**.

**Best of all: Zero YAML required.** All cards feature a complete visual UI editor right inside Home Assistant!

---

## Installation

**Method 1: HACS (Recommended)**
Installation is easiest via the [Home Assistant Community Store (HACS)](https://hacs.xyz/). Gaming Status Cards is a default repository in HACS, so you do not need to add any custom links! 

Simply click the button below (requires My Home Assistant configured) to open the download page directly, or search for "Gaming Status Cards" in HACS.

[![Open HACS Repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=adamjthompson&repository=Gaming-Status-Cards&category=dashboard)

**Method 2: Manual**
1. Open HACS in your Home Assistant instance.
2. Click the three dots in the top right corner and select **Custom repositories**.
3. Paste the URL of this repository.
4. Select **Dashboard** as the category and click **Add**.
5. Click on the new **Gaming Status Cards** integration and hit **Download**.
6. When prompted, reload your browser cache.

---

## The Cards

When you edit a dashboard and click **Add Card**, you will now see twelve new options at the bottom of your card picker.

### 1. Gaming Status - List
A clean, native-feeling list of your tracked gamers. It dynamically tints the card backgrounds based on the active platform and gracefully handles offline states.

**UI Configuration Options:**
* **Mode:** Choose who to show. Show everyone, strictly online players, or filter by a specific platform (PC, Custom, Discord, Steam, Xbox, PlayStation, Playnite).
* **Color Mode:** Select border and background fade colors based on the game's dominant color or the platform color. The "Game Artwork (Dynamic)" option is hidden (and the platform color is used automatically) if **Enable Game Color Extraction** is turned off in the integration's Global Settings, since no game color would ever be available.
* **Offline Image Style:** Choose whether offline players display their last played game's artwork or their player avatar.
* **Sort By:** Automatically sorts players chronologically by who was `Last Online`. Actively online players are always pinned to the top. Can also be sorted alphabetically by Name or Game Title.
* **Visibility:** Toggle the platform icon badges and text shadows to fit your dashboard theme.
* **Maximum Visible Players:** Limit how many players will be shown at once before a scrollbar is displayed.

**Online Now**
![Currently Playing Card Screenshot](images/playing.png)

**Recent Players**
![Recent Players Card Screenshot](images/recent.png)

**Platform-Specific**
![Platform-Specific Card Screenshot](images/steam.png)

---

### 2. Gaming Status - Slideshow
A dynamic, CSS-animated slideshow that cycles through the high-resolution cover art of currently active games and media.

**UI Configuration Options:**
* **Artwork Type:** Choose which art style to display: Hero (Horizontal Landscape) or Cover/Grid (Vertical Portrait). Logo and Icon aren't offered here — their transparent backgrounds can look broken crossfading over whatever's behind them.
* **Aspect Ratio Override:** Manually define the card's dimensions (e.g., `3840/1240`, `16/9`, `1/1`). Leave blank to automatically use the default ratio for the selected artwork style.
* **Timing Controls:** Set the exact number of seconds each slide displays, and how long the crossfade transition takes.
* **Player Avatars:** Automatically superimposes the avatar of the person playing the game into the bottom right corner.
* **Auto-Hide:** Automatically hides the entire card from your dashboard if no one is currently playing a game, saving valuable screen real estate.
* **Plex Integration:** Optionally pull in active media sessions from your Plex server. Choose **None**, **Plex (media_player)** for the [native Plex integration](https://www.home-assistant.io/integrations/plex/), or **Tautulli (sensor)** for Tautulli session sensors. *(The Tautulli option requires the [Tautulli Active Streams integration](https://github.com/Richardvaio/Tautulli_Active_Streams) to be installed and configured).*
* **Avatar Name Map:** *(Only shown when Player Avatars is enabled and Plex Integration is set to Plex or Tautulli.)* Override the letter shown on a Plex account's avatar badge — useful when a Plex username doesn't start with a letter that identifies who it belongs to. Comma-separated `username = letter` pairs, e.g. `someusername = M, anotherusername = J`, the same format as Gaming Status's own Title/Rating Overrides. Leave blank to keep showing each account's first letter.

**Slideshow with Player Avatars**
![Large Slideshow Card Screenshot](images/wide.png)

---

### 3. Gaming Status - Weekly Activity
A native SVG stacked bar chart showing daily gaming hours over a rolling 7-day (or calendar) window, stacked either by player or by individual game.

**UI Configuration Options:**
* **Chart Title:** Optional title displayed above the chart.
* **Stack By:** **Player** (each player's own daily hours, stacked) or **Game** (hours aggregated across all selected players, broken down by individual game title).
* **Time Window:** Choose the time period to display: **Rolling (Past 7 Days)** or **Calendar (Since Sunday)**.
* **Player Filter:** Show all tracked players, a single selected player, or a custom subset of players.
* **Max Games to Display** *(Stack By: Game only)*: Ranks games by total hours across all selected players and shows the top N titles (default: 6, max: 20).
* **Custom Colors:** Override the default vibrant palette with a comma-separated list of CSS colors (e.g., `#ffbe0b, rgb(251, 86, 7), blue`).
* **Legend:** Toggle the legend below the chart on or off. Hiding it reclaims the legend area and gives the chart more vertical space. Defaults to on.
* **Exclusions** *(Stack By: Player only)*: When enabled, players with no hours in the selected time window are excluded from both the chart and the legend. Useful for squads where not everyone plays every week. Defaults to off.

**Weekly Activity (Stack By: Player)**
![Weekly Hours Chart Screenshot](images/week-hours.png)

**Weekly Activity (Stack By: Game)**
![Weekly Games Chart Card Screenshot](images/week-games.png)

---

### 4. Gaming Status - Platforms
A native SVG stacked bar chart for visualizing platform usage across your squad.

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the chart.
* **Time Window:** Choose the time period to display: **Rolling (Past 7 Days)** or **Calendar (Since Sunday)**.
* **Player Filter:** Show all tracked players, a single selected player, or a custom subset of players.
* **Custom Colors:** Leave blank to use native platform brand colors (Xbox green, PlayStation blue, PC teal). Override with a comma-separated list of CSS colors.
* **Legend:** Toggle the platform legend below the bar on or off. The legend automatically wraps to multiple rows on narrow screens. Defaults to on.
* **Total:** Toggle the grand total playtime line below the legend on or off. Defaults to on.

**Platform Split**
![PLatform Split Card Screenshot](images/platforms.png)

---

### 5. Gaming Status - Leaderboard
A dependency-free native CSS bar chart that ranks your squad across a variety of gaming metrics.

**UI Configuration Options:**
* **Leaderboard Metric:** Choose what stat to rank players by:
  * **Most Played Hours (Weekly)** - who logged the most time this week.
  * **Longest Gaming Session** - who had the single longest unbroken session.
  * **Most Different Games Played** - who has the broadest taste.
  * **Top Games: Hours Per Game (Aggregate)** - ranks games instead of players, showing which titles consumed the most time across your whole squad this week.
  * **All-Time Total Hours** — ranks players by their entire lifetime tracked playtime, not just the current window.
  * **All-Time Session Count** - ranks players by how many completed sessions they've logged, ever.
  * **Top Games: All-Time Hours Per Game (Aggregate)** - like the weekly version, but ranks games by lifetime hours across your whole squad.
  * **Steam Games: Total Playtime** - a per-game breakdown of lifetime Steam playtime, sourced from Steam's own official playtime data (requires **Full Game Library Scan** to be enabled for Steam). Works with all three Player Filter modes just like the other Top Games metrics — a game more than one selected player has played combines into one total bar. A player without Full Game Library Scan enabled for Steam simply contributes nothing; if none of the selected players have any data, the card shows "No playtime totals available" instead of a chart.
* **Time Window:** Choose the time period to display: **Rolling (Past 7 Days)** or **Calendar (Since Sunday)**. Automatically hidden when an All-Time metric or **Steam Games: Total Playtime** is selected, since neither is scoped to a window.
* **Player Filter:** Show all tracked players, a single selected player, or a custom subset of players.
* **Items to Display (Rows):** Set how many ranked entries are shown (default: 3, max: 20).
* **Custom Colors:** Override the default vibrant palette with a comma-separated list of CSS colors.

**Leaderboard Cards**
![Most Hours Screenshot](images/leaderboard-most-hours.png)

![Longest Session Screenshot](images/leaderboard-longest.png)

![Most Variety Screenshot](images/leaderboard-variety.png)

![Top Games Screenshot](images/leaderboard-hours-game.png)
---

### 6. Gaming Status - Recent Activity
A configurable table (or icon grid) of recently completed play sessions or recently unlocked achievements/trophies, newest first, with optional blurred artwork behind each row. Event Type picks the data source; when Achievements is selected, Display Mode further picks Table or Icon Grid. *Achievements requires **Enable Achievement/Trophy Tracking** under the integration's Achievements & Ratings menu — the card shows a friendly notice instead of an empty table/grid if it's off. Sessions has no such requirement.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the card.
* **Event Type:** **Sessions** (play sessions) or **Achievements/Trophies** (unlock history).
* **Display Mode** *(Achievements only)*: **Table** (one row per unlock) or **Icon Grid** (a compact grid of icons with hover detail). Sessions is always a table.
* **Platforms:** Sessions offers Steam, Xbox, PlayStation, Playnite, Custom, and Discord; Achievements offers only Steam, Xbox, and PlayStation — the three platforms that ever produce achievement/trophy data. Independently check/uncheck to only include selected platforms.
* **Player Filter:** Show all tracked players, a single selected player, or a custom subset of players. In **Single Player** mode, the Player column/hover field is automatically hidden since it would be redundant.
* **Number of Sessions/Achievements to Display** *(Table modes only)*: How many recent rows to show (default: 10, max: 20). If more than 10 would be shown, the list scrolls instead of growing taller. Type a value and click **Apply** to confirm it.
* **Icons Per Row / Rows** *(Icon Grid only)*: How many icons appear per row (2–6) and how many rows to show (1–5). Total icons shown = Icons Per Row × Rows.
* **Icon Background / Artwork Size** *(Icon Grid only)*: A backdrop behind each icon — **None (Transparent)**, **Black**, or **White** — since some platforms' icons have transparent backgrounds; and **Crop to Square** or **Show Full Image** for how each icon fills its cell.
* **Hover Info** *(Icon Grid only)*: Independently toggle which fields appear when hovering an icon — Player, Platform, Game, Achievement, and Date/Time.
* **Background** *(Table modes only)*: Choose what renders (blurred) behind each row — **Game Artwork**, **Achievement Icon** *(Achievements only — the unlock's own icon/trophy image, falling back to the game's artwork then the player's avatar)*, **Player Avatar**, or **None**.
* **Color Mode** *(Table modes only, hidden when Background is None)*: Sessions offers **Game Artwork (Dynamic)** (tints from that session's own recorded game color) or **Platform Native (Pre-Defined)** (fixed per-platform brand color); Achievements offers **Platform Native**, **None** (untinted), or **Game Artwork (Dynamic)** *(only offered when Game Color Extraction is enabled integration-wide, falling back to Platform Native if later disabled)*. Rows without a stored/extracted game color fall back to a neutral black gradient in Dynamic mode.
* **Show Header Row** *(Table modes only)*: Toggle the column header row on or off.
* **Visible Columns** *(Table modes only)*: Sessions offers Avatar, Player, Game, Platform, Duration, Date, Start, and End; Achievements offers Avatar, Player, Game, Platform, Achievement, Date, and Time. Avatar adds a small profile picture inside the Player cell (not its own column) and, like Player, is hidden automatically in Single Player mode.

**Recent Activity (Sessions)**
![Recent Sessions Card Screenshot](images/recent-sessions.png)

An icon without its own captured artwork (Icon Grid mode) falls back to that unlock's game artwork, then a generic trophy glyph — recency order is always preserved regardless of which unlocks have art.

---

### 7. Gaming Status - Game Management
A utility card for cleaning up mislabeled or unwanted play history. Rename a game across a player's stored history — including its recorded achievement/trophy unlocks, not just play sessions — (merging it into an existing name if one matches), permanently purge every trace of a game (sessions, daily/weekly totals, and archived per-day breakdowns), delete or reassign an individual session, or manually backfill a session that was never tracked.

Unlike the other cards, Action/Player/Platform/Game are chosen live on the card itself rather than configured in YAML. The editor only controls which player(s) the card can act on.

Pick an **Action** first — **Add**, **Delete**, **Reassign**, or **Rename** — and only the fields relevant to that action appear below it.

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the card.
* **Player Filter:** **All Players** shows a player picker directly on the card; **Single Player** pins the card to one player and hides the picker.
* **Action (on the card):** Choose what you're doing first — **Add**, **Delete**, **Reassign**, or **Rename** — before any of the fields below appear.
* **Player / Platform (on the card):** Shown for every action. Platform defaults to **All Platforms** (acts across every platform this player has data on); pick a specific platform to scope the action to just that platform's history. **Add** requires a specific platform, since a new session must go to exactly one sensor.
* **Game (on the card):** Shown for Delete/Reassign/Rename only — a dropdown of every game found in the selected player/platform's history, labeled with total recorded playtime. A game with achievements/trophies but no tracked playtime (discovered via the Full Game Library Scan rather than actually being played through this integration) is labeled with its unlock count instead, and is only offered under Rename — Delete excludes it, since it has no playtime/session history to purge and would simply reappear at its next scheduled scan anyway. Not shown for Add, which names a new game via free text instead.
* **Rename:** Type a new name and click **Rename**. Only enabled once a game is selected and the new name is non-empty and different from the current name. Renames the game across every kind of stored history at once — sessions, daily/weekly/lifetime totals, and any recorded achievement/trophy unlocks — merging into an existing name's history if one already matches.
* **Delete:** Click **Delete** to permanently remove all history for the selected game, after confirming in a "Completely remove *Game* from *Player*'s profile?" prompt (no quotes around the title, since it's a plain sentence, not a literal value to retype) — cannot be undone. If the selected game has any individually-listed sessions, a session picker and **Delete Session** button also appear above it, to remove just one session (correcting only its contribution to daily/weekly/lifetime totals) without touching any other session of the same game. *Only sessions still present in the platform's recent-session history can be targeted this way; once a session ages out into the archived daily totals, only the whole-game **Delete** remains available for it.*
* **Reassign:** Pick a session from the picker, then choose a destination **player** and **platform** (the platform list is scoped to whatever that player actually has configured) and click **Reassign** to move the selected session to them instead (corrects totals on both ends). Useful when a session was tracked under the wrong person's profile, e.g. the wrong account signed into a shared Xbox/Steam app or console.
* **Add:** Enter a game title and a start/end time (a live duration preview appears once both are set) and click **Add Session** to manually backfill history that was never tracked — e.g. play that happened while the integration was offline, or a title that wasn't detected.

---

### 8. Gaming Status - PlayStation Trophies

A single player's lifetime Bronze/Silver/Gold/Platinum trophy totals, shown as four columns of large trophy icons with each tier's count below it. *Requires **Full Game Library Scan** to be enabled for PlayStation — the card shows a friendly notice instead if that data source isn't available for the selected player.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the row.
* **Player:** A single player dropdown (this card always shows exactly one player at a time).
* **Background:** A backdrop behind the row of four columns — **None (Transparent)**, **Black**, or **White**.
* **Show Tier Labels:** Toggle the "Bronze"/"Silver"/"Gold"/"Platinum" text under each icon.
* **Show Total Available:** Toggle the "of Y" total-possible line under each earned count.
* **Show Active Game Trophies:** When checked, shows trophy counts for whatever PlayStation game this player is *currently* playing instead of their full library totals. Falls back to the full-library totals whenever no PlayStation game is currently active, or the active game hasn't been resolved by a library scan yet. Unchecked by default.
* **Show Game Title** *(only shown when Show Active Game Trophies is checked)*: Adds a centered line below the trophies naming the active game — its specific console too, if known (e.g. "Ratchet & Clank (PS3)"). Checked by default.
* **Show Active Game Artwork** *(only shown when Show Active Game Trophies is checked)*: Displays the active game's hero art as a blurred, slightly darkened background behind the whole card. Unchecked by default.
* **Trophy Images:** **Official Trophy Images** (default — tries PSN's own official trophy image per tier, falling back to a `mdi:trophy` icon tinted to approximate that tier's real-world color if the image fails to load) or **Icons Only** (always use the tinted icon, never attempt to load an image).

---

### 9. Gaming Status - Completion Tracker

A single player's 100%-complete or near-complete games, shown as a slideshow, a scrollable grid, or a ranked bar list. Filter picks which set of games; Display Mode picks how they're shown. *Requires **Full Game Library Scan** to be enabled for at least one platform — the card shows a friendly notice instead if that data source isn't available for the selected player.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the card.
* **Player:** A single player dropdown.
* **Filter:** **100% Complete** (100% of achievements/trophies earned) or **Near Completion** (highest percentage first, excluding anything already at 100%).
* **Platforms:** Independently check/uncheck Steam, Xbox, and PlayStation to only include matching games from selected platforms.
* **Exclude PlayStation Games Without Platinum Trophies** *(Filter: 100% Complete only, shown when PlayStation is checked above):* Some PlayStation titles (e.g. Journey) have no platinum trophy at all, so 100% completion is achievable without earning one. Check this to only show 100%-complete PlayStation games that actually have a platinum trophy. Unchecked by default.
* **Exclude Games Inactive For** *(Filter: Near Completion only):* **Never (Show All)** (default) or 1–12 months. Based on each game's last recorded activity: Xbox uses its last-played timestamp, while PlayStation and Steam use their last-achievement/trophy-earned timestamp instead (neither API exposes a separate "last played" signal). *(Note: for PlayStation and Steam specifically, this means a game you're actively stuck on without earning anything new could still get excluded.)* A game with no recorded activity at all is never excluded.
* **Max Games to Display:** How many games to show at most (1–50). Click **Apply** to confirm the value.
* **Display Mode:** **Grid** (a responsive grid of artwork), **Slideshow** (one game crossfading into the next, using the same CSS-animated crossfade as the Slideshow card), or **Ranked List** *(Filter: Near Completion only — Ranked List isn't offered under 100% Complete, since sorting by percentage is meaningless when everything shown is already at 100%)*.
* **Artwork** *(Grid/Slideshow only):* Which image to show per game — **Cover/Grid (Vertical Portrait)** (default), **Hero (Horizontal Landscape)**, **Logo (Transparent Title)**, or **Icon (Small Square)**. Falls back to Cover, then Hero, if the selected type wasn't captured for a given game. **Logo and Icon aren't offered when Display Mode is Slideshow** — their transparent backgrounds can look broken crossfading over whatever's behind them — the field resets to Cover if you switch a saved Logo/Icon config to Slideshow.
* **Grid Columns** / **Rows Before Scrolling** *(Grid mode only):* 1–4 images per row; how many rows show before the grid scrolls instead of growing taller (default: 3).
* **Time Per Slide** / **Transition Fade Time** *(Slideshow mode only):* Seconds each game's artwork is shown, and seconds spent crossfading into the next one.
* **Scroll After (Entries)** *(Ranked List only):* How many rows show before the list scrolls instead of growing taller (default: 10).
* **Bar Color** *(Ranked List only):* **Platform Colors** (default — each bar tinted by that game's own platform: Steam blue, Xbox green, PlayStation blue), or the same named palettes (Vivid, Material, Muted, Soft) and Custom Colors option available on the Leaderboard/Weekly Activity/Platforms cards.

In Grid mode, hovering an image shows a tooltip with the game's title (and platform, if more than one platform is checked) — matching the same tooltip style used elsewhere in this bundle. Slideshow mode shows artwork only, with no title or tooltip — a hover tooltip isn't technically possible there, since every slide occupies the same on-screen position and only differs by which one is currently faded in.

---

### 10. Gaming Status - Stats

A configurable, two-column summary of a single player's completion/trophy/achievement stats. *Requires **Full Game Library Scan** to be enabled for at least one platform — the card shows a friendly notice instead if that data source isn't available for the selected player.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the grid.
* **Player:** A single player dropdown.
* **Platforms:** Independently check/uncheck Steam, Xbox, and PlayStation — unchecking a platform removes its contribution from every stat below, not just the platform-specific ones.
* **Stats to Display:** Independently toggle any of: Games Tracked, Average Completion, Total Gamerscore, Total Trophies, Platinum/Gold/Silver/Bronze Trophies, Steam Achievements, and Total Steam Hours. Each shows as "earned / total" where a total naturally exists (all except Games Tracked, Average Completion, and Total Steam Hours).

---

### 11. Gaming Status - Library

A scrollable, artwork-and-stats browser of a single player's full game library for one platform at a time. *Requires **Full Game Library Scan** to be enabled for the selected platform — the card shows a friendly notice instead if that data source isn't available for the selected player.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the list.
* **Player:** A single player dropdown.
* **Platform:** Steam, Xbox, or PlayStation — a single platform at a time (radio buttons, not checkboxes, since each game row's available stat fields depend on which platform is selected).
* **Exclude Games With Zero Completion:** Hide games with no progress at all (unchecked by default — shows everything).
* **Artwork:** Same **Cover/Grid (Vertical Portrait)** (default) / **Hero (Horizontal Landscape)** / **Logo (Transparent Title)** / **Icon (Small Square)** options as the Completion Tracker card's Grid/Slideshow modes (Logo/Icon remain available here, since this card is a static list, not a crossfading slideshow). Cover/Logo/Icon display to the left of each game's data, boxed to a fixed size with square corners; Hero displays above it instead, scaled to the row's full width at its own natural aspect ratio, since a wide banner doesn't suit a narrow side thumbnail.
* **Scroll After (Entries):** How many games show before the list scrolls instead of growing taller (default: 4).
* **Show Total:** Toggle a "`N` games" count above the list.
* **Fields to Display:** Title, Completion Percentage, and either **Trophy Counts** (PlayStation — four lines, one per tier: "Bronze: X / Y", etc.) or **Achievement Count** (Steam/Xbox — one "X / Y" line), whichever applies to the selected platform.

---

### 12. Gaming Status - Gamercard

An Exophase-style summary card for a single player on a single platform: avatar, a blurred/darkened hero-art background of their most recently played game, and rows for their most-recently-played games each showing that game's own artwork alongside up to four of its most recently unlocked achievement/trophy icons — plus a set of individually toggleable stats. *Requires **Full Game Library Scan** to be enabled for the selected platform — the card shows a friendly notice instead if that data source isn't available for the selected player.*

**UI Configuration Options:**
* **Card Title:** Optional title displayed above the card.
* **Player:** A single player dropdown.
* **Platform:** Steam, Xbox, or PlayStation — a single platform at a time, same as the Library card.
* **Recent Games to Show:** How many of the player's most-recently-played games get their own row (1–10).
* **Stats to Display:** Total Games in Library, Total Completion Percentage, and Game Completion Percentage (all three always offered — the last one shows each game row's own completion % next to its icons, distinct from the library-wide average above), plus whichever of these apply to the selected platform — **Total Gamerscore** (Xbox), **Total Trophies**/**Total Achievements** (PlayStation/Steam), **Total Playtime** (Steam — automatically hidden whenever it's 0, even if checked), and **Trophy Breakdown** (PlayStation — a compact Bronze/Silver/Gold/Platinum count row).
* **Trophy Images** *(PlayStation only, shown when Trophy Breakdown is checked)*: **Official Trophy Images** or **Icons Only**, same option as the PlayStation Trophies card.

Hovering an achievement/trophy icon shows a tooltip with its name and the date/time it was earned. A game row with no captured logo/icon/cover art falls back to its plain title text instead; a game with fewer than four recorded recent unlocks (or none at all) just shows fewer icons rather than a placeholder.

---

## Advanced Configuration (Manual Entities / Selected Players)

By default, all cards are entirely plug-and-play. They automatically scan your Home Assistant instance for any sensors generated by the Gaming Status integration (and Plex/Tautulli, if enabled) and populate the UI.

The **List** and **Slideshow** cards feature a **Manual Entities** override in their Advanced section. The **Weekly Activity**, **Platforms**, **Leaderboard**, and **Recent Activity** cards use a **Player Filter** setting instead, with a **Selected Players** option that reveals the same kind of field. (**PlayStation Trophies**, **Completion Tracker**, **Stats**, **Library**, and **Gamercard** are always scoped to a single player, so they use a plain player dropdown instead.)

In both cases, just enter a comma-separated list of **player names** — e.g. `adam, josh, liv` — no need to look up or type full entity IDs. Full entity IDs are still accepted too (handy for non-gamer entities like Plex sessions below, or in the rare case a name is ambiguous), and any entry that doesn't match a known player name or an existing entity is silently ignored rather than causing an error.

**How Manual Entities interact with Plex (Slideshow card):**
* **To restrict both gamers AND Plex sessions:** Set the Plex Integration to **None**, and manually type out only the gamers and Plex session sensors you want to see (e.g., `adam, sensor.plex_session_1_tautulli`). The card will automatically format the Tautulli text bubbles correctly.
* **To restrict gamers but show ALL Plex sessions:** Type your specific gamers into the Manual Entities box (e.g., `adam, josh`), and set Plex Integration to **Tautulli** or **Plex**. The card will restrict the gaming sensors to your list, but automatically sweep up every active Plex session on your network.

---

## YAML Reference
For advanced users who prefer to write YAML, here are the base configurations for each card:

**The List Card:**
```yaml
type: custom:gaming-status-card
title: The Squad # Can be left blank to omit the title
mode: all # Options: all, online, pc, custom, discord, steam, xbox, playstation, playnite
sort_by: last_online # Options: last_online, name, state
show_badges: true
show_text_shadow: true
color_mode: game # Options: game, platform
offline_image: game # Options: game, avatar
max_visible_players: " " # Limit visible rows before scrollbar appears
manual_entities: " " # Whitelist of comma-separated player names or entity IDs
```

**The Slideshow Card:**
```yaml
type: custom:gaming-slideshow-card
artwork_type: hero # Options: hero, cover (logo/icon removed -- transparency issues when crossfading)
aspect_ratio: " " # Leave blank to use the default for your artwork type
time_per_slide: 5 # Display time for each slide (seconds)
transition_time: 1 # Transition time (seconds)
show_avatars: true
auto_hide: true
plex_source: none # Options: none, plex, tautulli
manual_entities: " " # Whitelist of comma-separated player names or entity IDs
avatar_name_map: " " # Only used when show_avatars is true and plex_source is plex/tautulli. "username = letter" pairs, e.g. "someusername = M, anotherusername = J"
```

**The Weekly Activity Card:**
```yaml
type: custom:gaming-status-weekly-activity-card
title: Weekly Activity
stack_by: player # Options: player, game
window: rolling # Options: rolling, calendar
mode: all # Options: all, single, selected
single_entity: " " # A single sensor ID (used when mode is 'single')
selected_entities: " " # Comma-separated player names or entity IDs (used when mode is 'selected')
max_games: 6 # Number of top games to display (stack_by: game only)
custom_colors: " " # Override the default colors
show_legend: true # Set to false to hide the legend and give more space to the chart
hide_empty: false # Set to true to exclude players with no hours in the selected window (stack_by: player only)
```

**The Platforms Card:**
```yaml
type: custom:gaming-status-donut-card
title: Platform Split
window: rolling # Options: rolling, calendar
mode: all # Options: all, single, selected
single_entity: " " # A single sensor ID (used when mode is 'single')
selected_entities: " " # Comma-separated player names or entity IDs (used when mode is 'selected')
custom_colors: " " # Override the default colors (Xbox, PlayStation, PC)
show_legend: true # Set to false to hide the platform legend; legend wraps automatically on narrow screens when shown
show_total: true # Set to false to hide the grand total playtime line
```

**The Leaderboard Card:**
```yaml
type: custom:gaming-status-leaderboard-card
title: Gaming Leaderboard
metric: hours # Options: hours, longest, games, game_hours, all_time_hours, all_time_sessions, all_time_top_games
window: rolling # Options: rolling, calendar
mode: all # Options: all, single, selected
single_entity: " " # A single sensor ID (used when mode is 'single')
selected_entities: " " # Comma-separated player names or entity IDs (used when mode is 'selected')
max_players: 3 # Number of ranked rows to display
custom_colors: " " # Override the default colors
```

**The Recent Activity Card:**
```yaml
type: custom:gaming-status-recent-activity-card
title: Recent Activity
event_type: sessions # Options: sessions, achievements
display_mode: table # Options: table, icons (achievements only -- sessions is always a table)
show_platform_steam: true # Sessions: steam/xbox/playstation/playnite/custom/discord; Achievements: steam/xbox/playstation only
show_platform_xbox: true
show_platform_playstation: true
show_platform_playnite: true # Sessions only
show_platform_custom: true # Sessions only
show_platform_discord: true # Sessions only
mode: all # Options: all, single, selected
single_entity: " " # A single sensor ID (used when mode is 'single')
selected_entities: " " # Comma-separated player names or entity IDs (used when mode is 'selected')
max_sessions: 10 # Sessions/table: number of rows to display (max 20); scrolls once more than 10 are shown
max_achievements: 10 # Achievements/table: number of rows to display (max 20); scrolls once more than 10 are shown
icons_per_row: 4 # Achievements/icons only. Options: 2, 3, 4, 5, 6
rows: 1 # Achievements/icons only. 1-5; total icons shown = icons_per_row * rows
icon_background: none # Achievements/icons only. Options: none (transparent), black, white
artwork_size: crop # Achievements/icons only. Options: crop, contain
show_hover_player: true # Achievements/icons only. Automatically hidden when mode is 'single'
show_hover_platform: true # Achievements/icons only
show_hover_game: true # Achievements/icons only
show_hover_achievement: true # Achievements/icons only
show_hover_datetime: true # Achievements/icons only
background: art # Table modes only. Sessions options: art, avatar, none; Achievements options: art, icon, avatar, none
color_mode: game # Table modes only. Sessions options: game, platform; Achievements options: none, platform, game
show_header: true # Table modes only. Set to false to hide the column header row
show_column_avatar: false # Table modes only. Adds a small profile picture inside the Player cell -- off by default, automatically hidden when mode is 'single'
show_column_player: true # Table modes only. Automatically hidden when mode is 'single'
show_column_game: true # Table modes only
show_column_platform: true # Table modes only
show_column_duration: true # Sessions/table only
show_column_date: true # Table modes only
show_column_start: true # Sessions/table only
show_column_end: true # Sessions/table only
show_column_achievement: true # Achievements/table only
show_column_time: true # Achievements/table only
```

**The Game Management Card:**
```yaml
type: custom:gaming-status-game-management-card
title: Game Management
mode: all # Options: all, single
single_entity: " " # A single player's master sensor ID (used when mode is 'single')
```

**The PlayStation Trophies Card:**
```yaml
type: custom:gaming-status-playstation-trophies-card
title: PlayStation Trophies
single_entity: " " # A single player's master sensor ID
background: none # Options: none (transparent), black, white
show_labels: true # Set to false to hide the Bronze/Silver/Gold/Platinum tier prefixes
show_total: true # Set to false to hide the "/Y" half of each count, leaving just the earned number
image_style: official # Options: official (try PSN's own image, fall back to a tinted icon), icons (icon only, never attempt an image)
```

**The Completion Tracker Card:**
```yaml
type: custom:gaming-status-completion-tracker-card
title: Completion Tracker
single_entity: " " # A single player's master sensor ID
filter: complete # Options: complete (100% Complete), near (Near Completion)
show_platform_steam: true # Uncheck any of these to exclude that platform's games
show_platform_xbox: true
show_platform_playstation: true
exclude_playstation_no_platinum: false # filter: complete only
exclude_inactive_months: 0 # filter: near only. Options: 0 (never exclude, default), 1-12 -- Steam games are never excluded (no last-activity data available)
max_games: 12 # Number of games to display (max 50)
display_mode: grid # Options: grid, slideshow, list (list -- Ranked List -- is only offered when filter is 'near')
artwork_mode: cover # Grid/Slideshow only. Options: cover, hero, logo, icon (logo/icon are only valid when display_mode is 'grid')
grid_columns: 3 # Grid mode only. Options: 1, 2, 3, 4
grid_max_rows: 3 # Grid mode only. Rows before the grid scrolls
time_per_slide: 5 # Slideshow mode only. Seconds per slide
transition_time: 1 # Slideshow mode only. Crossfade duration in seconds
scroll_after: 10 # List mode only. Number of rows before the list scrolls
color_palette: platform # List mode only. Options: platform (default, per-game platform color), vivid, material, muted, soft, custom
custom_colors: "" # List mode only. Comma-separated hex colors (used when color_palette is 'custom')
```

**The Stats Card:**
```yaml
type: custom:gaming-status-stats-card
title: Stats
single_entity: " " # A single player's master sensor ID
show_platform_steam: true # Uncheck any of these to exclude that platform from every stat below
show_platform_xbox: true
show_platform_playstation: true
show_stat_games_tracked: true # Uncheck any of these to hide that stat
show_stat_avg_completion: true
show_stat_total_gamerscore: true
show_stat_total_trophies: true
show_stat_platinum_trophies: true
show_stat_gold_trophies: true
show_stat_silver_trophies: true
show_stat_bronze_trophies: true
show_stat_steam_achievements: true
show_stat_total_steam_hours: true
```

**The Library Card:**
```yaml
type: custom:gaming-status-library-card
title: Library
single_entity: " " # A single player's master sensor ID
platform: steam # Options: steam, xbox, playstation (single platform at a time)
exclude_zero_completion: false # Set to true to hide games with no progress at all
artwork_mode: cover # Options: cover, hero, logo, icon (all four remain available -- this card is a static list, not a slideshow)
scroll_after: 4 # Number of entries before the list scrolls
show_total: true # Set to false to hide the "N games" count above the list
show_field_title: true
show_field_percent: true
show_field_counts: true # Trophy Counts (PlayStation) or Achievement Count (Steam/Xbox), depending on `platform`
```

**The Gamercard:**
```yaml
type: custom:gaming-status-gamercard-card
title: Gamercard
single_entity: " " # A single player's master sensor ID
platform: playstation # Options: steam, xbox, playstation (single platform at a time)
recent_games_count: 2 # Number of most-recently-played games to show as rows (1-10)
show_game_count: true # Total games in library -- always offered
show_completion_percent: true # Average completion % across the whole library -- always offered
show_game_completion: true # Each game row's own completion % next to its icons -- always offered
show_gamerscore: true # Xbox only
show_total_trophies: true # PlayStation/Steam only (Total Trophies / Total Achievements)
show_total_playtime: true # Steam only -- hidden automatically when playtime is 0, even if true
show_trophy_breakdown: true # PlayStation only
image_style: official # Options: official, icons (PlayStation trophy breakdown only)
```
