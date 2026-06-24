// ====================================================================
// CARD 1: GAMING STATUS - LIST
// ====================================================================

class GamingStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-card-editor");
  }

  static getStubConfig() {
    return {
      mode: "all",
      color_mode: "game",
      offline_image: "game",
      sort_by: "last_online",
      show_badges: true,
      show_text_shadow: true,
      max_visible_players: "",
      manual_entities: "",
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      entities_pattern: config.entities_pattern || "_master",
      mode: config.mode || "all",
      color_mode: config.color_mode || "game",
      offline_image: config.offline_image || "game",
      sort_by: config.sort_by || config.sort || "last_online",
      show_badges: config.show_badges !== false,
      show_text_shadow: config.show_text_shadow !== false,
      max_visible_players: config.max_visible_players || "",
      manual_entities: config.manual_entities || "",
    };
    this._lastHash = ""; 
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let targetSuffix = "_master";
    if (["steam", "xbox", "playstation", "pc", "custom", "discord", "playnite"].includes(this.config.mode)) {
      targetSuffix = `_${this.config.mode}`;
    }

    let currentHash = "";
    let rawEntities = [];

    if (this.config.manual_entities && this.config.manual_entities.trim() !== "") {
      const entityIds = this.config.manual_entities.split(",").map((e) => e.trim());
      for (const id of entityIds) {
        if (hass.states[id]) {
          rawEntities.push(hass.states[id]);
          currentHash += hass.states[id].state + hass.states[id].last_updated;
        }
      }
    } else {
      for (const entityId in hass.states) {
        if ((entityId.startsWith("sensor.gaming_status_") || entityId.startsWith("binary_sensor.gaming_status_")) && (entityId.endsWith(targetSuffix) || entityId.includes("anyone_gaming"))) {
          // Bulletproof check: Ensure it belongs to the integration by verifying a unique attribute
          if (hass.states[entityId].attributes.secondary !== undefined) {
            rawEntities.push(hass.states[entityId]);
            currentHash += hass.states[entityId].state + hass.states[entityId].last_updated;
          }
        }
      }
    }

    if (this._lastHash === currentHash) return;
    this._lastHash = currentHash;

    const processedData = this.processData(rawEntities);
    this.render(processedData);
  }

  processData(entities) {
    let filtered = entities.filter((entity) => {
      const state = entity.state.toLowerCase();
      const isOffline = ["offline", "unavailable", "unknown", "idle"].includes(state);
      if (this.config.mode === "online" && isOffline) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const stateA = a.state.toLowerCase();
      const stateB = b.state.toLowerCase();
      const isOfflineA = ["offline", "unavailable", "unknown", "idle"].includes(stateA);
      const isOfflineB = ["offline", "unavailable", "unknown", "idle"].includes(stateB);

      // 1. Primary Sort: Online players always float to the top
      if (isOfflineA !== isOfflineB) return isOfflineA ? 1 : -1;

      const sortBy = this.config.sort_by;
      const nameA = (a.attributes.friendly_name || a.entity_id).toLowerCase();
      const nameB = (b.attributes.friendly_name || b.entity_id).toLowerCase();

      // --- ALPHABETICAL SORT ---
      if (sortBy === "name") {
        return nameA.localeCompare(nameB);
      }
      
      // --- GAME TITLE SORT ---
      else if (sortBy === "state") {
        const getGame = (ent, isOff, st) => {
            if (!isOff) return st;
            if (ent.attributes.last_played_game) return String(ent.attributes.last_played_game);
            if (ent.attributes.secondary && String(ent.attributes.secondary).includes(":")) {
                let sec = String(ent.attributes.secondary);
                return sec.substring(sec.indexOf(":") + 1).replace(/\(.*?\)/g, "").trim();
            }
            return "";
        };

        let gameA = String(getGame(a, isOfflineA, stateA)).toLowerCase().trim();
        let gameB = String(getGame(b, isOfflineB, stateB)).toLowerCase().trim();

        // Push empty or unknown games to the absolute bottom 
        const emptyStates = ["none", "unknown", "null", "offline", "idle", ""];
        if (emptyStates.includes(gameA)) gameA = "zzzzzz";
        if (emptyStates.includes(gameB)) gameB = "zzzzzz";

        if (gameA === gameB) return nameA.localeCompare(nameB);
        return gameA.localeCompare(gameB);
      }
      
      // --- LAST ONLINE SORT (Default) ---
      else { 
        const getSafeTime = (ent, isOff) => {
          let ts = null;
          if (!isOff && ent.attributes.play_start_time) ts = ent.attributes.play_start_time;
          else if (isOff && ent.attributes.last_online_valid_timestamp) ts = ent.attributes.last_online_valid_timestamp;

          if (ts) {
            // A: Standard parse
            const t = Date.parse(ts);
            if (!isNaN(t)) return t;
            
            // B: Manual Regex Parse (Indestructible fallback for WebKit/Safari timezone rejections)
            const match = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
            if (match) return Date.UTC(match[1], match[2]-1, match[3], match[4], match[5], match[6]);
          }

          // C: Legacy string parsing fallback (for profiles without timestamps)
          if (isOff && ent.attributes.secondary) {
              const sec = String(ent.attributes.secondary).toLowerCase();
              const match = sec.match(/(\d+)\s*(mo|m|h|d|w|y)/);
              if (match) {
                  const val = parseInt(match[1]);
                  const unit = match[2];
                  let s = val * 60;
                  if (unit === 'h') s = val * 3600;
                  if (unit === 'd') s = val * 86400;
                  if (unit === 'w') s = val * 604800;
                  if (unit === 'mo') s = val * 2592000;
                  if (unit === 'y') s = val * 31536000;
                  return Date.now() - (s * 1000);
              }
          }
          
          // D: They are completely "Offline". 
          // By returning 0, they plummet to the bottom of the list instead of reading the database reboot time!
          return 0;
        };

        const timeA = getSafeTime(a, isOfflineA);
        const timeB = getSafeTime(b, isOfflineB);
        
        // Break exact time ties alphabetically so pure "Offline" players sort by name at the bottom
        if (timeA === timeB) return nameA.localeCompare(nameB);
        return timeB - timeA;
      }
    });

    return filtered.map((entity) => {
      const isPlatformMode = ["steam", "xbox", "playstation", "pc", "custom", "discord", "playnite"].includes(this.config.mode);
      
      // Look at the active_platform attribute FIRST.
      // If missing (because it's a direct platform sensor), scan the entity_id itself!
      const platform = (entity.attributes.active_platform || entity.entity_id || this.config.mode || "").toLowerCase();

      const platformMap = {
        "steam": { icon: "mdi:steam", color: "2, 173, 239" },
        "xbox": { icon: "mdi:microsoft-xbox", color: "11, 124, 16" },
        "playstation": { icon: "mdi:sony-playstation", color: "0, 48, 135" },
        "playnite": { icon: "https://cdn2.steamgriddb.com/icon/be74b7589d33efcb1ad9b3459fa8e2f3.png", color: "255, 88, 51" },
        "custom": { icon: "mdi:gamepad-square", color: "100, 50, 100" },
        "discord": { icon: "https://cdn2.steamgriddb.com/icon/3db4e2413cb7c36fbc1b96b821249933.png", color: "88, 101, 242" }
      };

      let badgeIcon = "mdi:controller";
      let platformColor = "100, 50, 100";

      // Find the first key that matches the platform string
      const matchedKey = Object.keys(platformMap).find(key => platform.includes(key));
      
      if (matchedKey) {
        badgeIcon = platformMap[matchedKey].icon;
        platformColor = platformMap[matchedKey].color;
      }

      let platformColorCSS = `rgb(${platformColor})`;
      let accentColorCSS = platformColorCSS; 
      let gradientColorCSS = "rgba(0, 0, 0, 1)";
      let filterCSS = "blur(5px)";
      
      const useGameColor = this.config.color_mode !== "platform";
      const rawColor = entity.attributes.game_dominant_color;

      let parsedGameColor = null;
      if (rawColor && String(rawColor).toLowerCase() !== "null" && String(rawColor).toLowerCase() !== "none") {
          let str = String(rawColor).trim().toLowerCase();
          if (str.startsWith('#')) {
              let h = str.replace('#', '');
              if (h.length === 3) h = [...h].map(x => x + x).join('');
              if (h.length === 6) {
                  const r = parseInt(h.substring(0,2), 16);
                  const g = parseInt(h.substring(2,4), 16);
                  const b = parseInt(h.substring(4,6), 16);
                  if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                      parsedGameColor = `rgb(${r}, ${g}, ${b})`;
                  }
              }
          } else if (str.startsWith('rgb')) {
              parsedGameColor = str;
          }
      }

      const isOffline = ["offline", "unavailable", "unknown", "idle"].includes(entity.state.toLowerCase());

      if (isPlatformMode) {
          gradientColorCSS = platformColorCSS; 
          filterCSS = "blur(5px)"; 
          if (useGameColor && parsedGameColor && !isOffline) {
              accentColorCSS = parsedGameColor; 
          }
      } else {
          if (isOffline) {
              gradientColorCSS = "rgba(0, 0, 0, 0)"; 
              filterCSS = "blur(5px) grayscale(100%) brightness(0.5)"; 
          } else {
              filterCSS = "blur(5px) brightness(0.8)";
              if (useGameColor && parsedGameColor) {
                  gradientColorCSS = parsedGameColor;
                  accentColorCSS = parsedGameColor;
              }
          }
      }

      const friendlyName = (entity.attributes.friendly_name || entity.entity_id).replace(/ Gaming Status| Master| Steam| Xbox| PlayStation| PC| Custom| Discord/gi, "")

      const isStrValid = (val) => val && String(val).toLowerCase() !== "null" && String(val).toLowerCase() !== "none" && val !== "unknown";
      let heroArt = isStrValid(entity.attributes.game_hero_art) ? entity.attributes.game_hero_art : "";
      let pictureArt = isStrValid(entity.attributes.entity_picture) ? entity.attributes.entity_picture : "";
      
      // Removed the hardcoded fallback strings so empty values evaluate to false in the render function
      let coverArt = heroArt || pictureArt || "";
      if (isOffline && this.config.offline_image === "avatar") {
          coverArt = pictureArt || "";
      }

      return {
        entity_id: entity.entity_id,
        name: friendlyName,
        state: entity.state,
        secondary: entity.attributes.secondary || "",
        picture: pictureArt, // Now correctly passes an empty string if there's no picture
        cover: coverArt,        
        accentColorCSS,
        gradientColorCSS,
        filterCSS,
        platformColorCSS,
        badgeIcon,
        isOffline,
      };
    });
  }

  render(data) {
    const escapeHTML = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .card-stack { display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box; }
          .card-stack.scrollable { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          
          .card-stack::-webkit-scrollbar { width: 6px; }
          .card-stack::-webkit-scrollbar-track { background: transparent; }
          .card-stack::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.4); border-radius: 3px; }
          .card-stack::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.8); }

          .player-card {
            position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px);
            background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
            display: flex; align-items: center; padding: 10px 10px; cursor: pointer; box-sizing: border-box;
            width: 100%; transition: transform 0.2s;
            flex-shrink: 0;
          }
          .player-card:active { transform: scale(0.98); }
          .player-card::before { content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; background-size: cover; background-position: center; z-index: 0; pointer-events: none;background-image: linear-gradient(to right, var(--card-gradient-color) 0%, rgba(0, 0, 0, 0.5) 100%), var(--bg-url); filter: var(--card-filter); }
          
          .player-card.online { border-right: 8px solid var(--card-accent-color); }
          .player-card.offline { border-right: none; }
          
          .content-wrapper { position: relative; z-index: 1; display: flex; align-items: center; width: 100%; gap: 12px; pointer-events: none; }
          .avatar-container { position: relative; width: 36px; height: 36px; flex-shrink: 0; }
          .avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
          
          .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; background: var(--platform-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; }
          .player-card.offline .badge { background: grey; }
          .badge ha-icon { --mdc-icon-size: 12px; margin-top: -2px; color: white; }
          .badge img.custom-badge { width: 14px; height: 14px; object-fit: contain; }

          .text-content { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
          .primary { font-weight: 600; font-size: 14px; color: white; text-shadow: ${
            this.config.show_text_shadow ? "1px 1px 2px rgba(0,0,0,0.8)" : "none"
          }; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 2px; }
          .secondary { font-size: 12px; color: #ffffff; text-shadow: ${
            this.config.show_text_shadow ? "1px 1px 2px rgba(0,0,0,0.8)" : "none"
          }; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
          
          .placeholder-avatar { background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

          .avatar.playnite { background: black; padding: 4px; box-sizing: border-box; }
        </style>
        <div id="players-container" class="card-stack"></div>
      `;
      this.content = this.shadowRoot.getElementById("players-container");
    }

    if (this.config.max_visible_players && parseInt(this.config.max_visible_players) > 0) {
      const maxPlayers = parseInt(this.config.max_visible_players);
      const maxHeight = (56 * maxPlayers) + (8 * (maxPlayers - 1));
      this.content.style.maxHeight = `${maxHeight}px`;
      this.content.classList.add("scrollable");
    } else {
      this.content.style.maxHeight = "";
      this.content.classList.remove("scrollable");
    }

    if (data.length === 0) {
      this.content.innerHTML = `
        <div class="player-card offline" style="--bg-url: none; --card-accent-color: rgb(128, 128, 128); --card-gradient-color: rgba(0, 0, 0, 1); --card-filter: blur(5px) grayscale(100%) brightness(0.5); cursor: default;" data-entity-id="">
          <div class="content-wrapper">
            <div class="avatar-container">
              <div class="placeholder-avatar">
                <ha-icon icon="mdi:gamepad-variant-outline" style="color: #aaa; --mdc-icon-size: 24px; margin-top: 0; margin-left: 0;"></ha-icon>
              </div>
            </div>
            <div class="text-content">
              <div class="primary" style="color: #aaa;">Nobody is playing</div>
              <div class="secondary" style="color: #888;">All tracked gamers are offline</div>
            </div>
          </div>
        </div>`;
      return;
    }

    this.content.innerHTML = data
      .map((player) => {
        const statusClass = player.isOffline ? "offline" : "online";
        const safeName = escapeHTML(player.name);
        const safeState = escapeHTML(player.state);
        const safeSecondary = escapeHTML(player.secondary);
        
        const bgLayer1 = player.cover ? `url('${player.cover}')` : 'none';
        const bgLayer2 = player.picture && player.picture !== player.cover ? `, url('${player.picture}')` : '';
        
        return `
        <div class="player-card ${statusClass}" style="--bg-url: ${bgLayer1}${bgLayer2}; --card-accent-color: ${player.accentColorCSS}; --card-gradient-color: ${player.gradientColorCSS}; --card-filter: ${player.filterCSS}; --platform-color: ${player.platformColorCSS};" data-entity-id="${player.entity_id}">
          <div class="content-wrapper">
            <div class="avatar-container">
              ${player.picture 
                ? `<img class="avatar ${player.picture.includes('playnite.link') ? 'playnite' : ''}" src="${player.picture}" />` 
                : `<div class="placeholder-avatar"><ha-icon icon="mdi:controller" style="color: #888; --mdc-icon-size: 24px;"></ha-icon></div>`
              }
              ${this.config.show_badges ? `
              <div class="badge">
                ${player.badgeIcon.startsWith('mdi:') 
                  ? `<ha-icon icon="${player.badgeIcon}"></ha-icon>` 
                  : `<img class="custom-badge" src="${player.badgeIcon}" />`
                }
              </div>` : ""}
            </div>
            <div class="text-content">
              <div class="primary">${safeName}</div>
              <div class="secondary">${player.state !== "Offline" ? safeState + " " : ""}${safeSecondary}</div>
            </div>
          </div>
        </div>`;
      })
      .join("");

    this.shadowRoot.querySelectorAll(".player-card").forEach((row) => {
      row.addEventListener("click", (e) => {
        const entityId = e.currentTarget.getAttribute("data-entity-id");
        if (entityId) {
          this.fireEvent("hass-more-info", { entityId });
        }
      });
    });
  }

  fireEvent(type, detail = {}, options = {}) {
    const event = new Event(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed,
    });
    event.detail = detail;
    this.dispatchEvent(event);
    return event;
  }
  
  getCardSize() {
    return Object.keys(this._hass.states).length > 0 ? 3 : 1;
  }
}

class GamingStatusCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this._config = config;
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
  }
  render() {
    if (!this._config) return;
    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], input[type="number"] { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input[type="text"]:focus, input[type="number"]:focus { outline: none; border-color: var(--primary-color); }
        .radio-group { display: flex; flex-direction: column; gap: 10px; }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
      </style>
      <div class="editor-container">
        <div><div class="section-title">Mode</div><div class="radio-group">
            <label><input type="radio" name="mode" data-field="mode" value="all" ${
              this._config.mode === "all" || !this._config.mode ? "checked" : ""
            }> All Players</label>
            <label><input type="radio" name="mode" data-field="mode" value="online" ${
              this._config.mode === "online" ? "checked" : ""
            }> Online Only</label>
            <label><input type="radio" name="mode" data-field="mode" value="steam" ${
              this._config.mode === "steam" ? "checked" : ""
            }> Steam</label>
            <label><input type="radio" name="mode" data-field="mode" value="xbox" ${
              this._config.mode === "xbox" ? "checked" : ""
            }> Xbox</label>
            <label><input type="radio" name="mode" data-field="mode" value="playstation" ${
              this._config.mode === "playstation" ? "checked" : ""
            }> PlayStation</label>
            <label><input type="radio" name="mode" data-field="mode" value="pc" ${
              this._config.mode === "pc" ? "checked" : ""
            }> PC (Steam, Discord, Playnite, & Custom)</label>
            <label><input type="radio" name="mode" data-field="mode" value="discord" ${
              this._config.mode === "discord" ? "checked" : ""
            }> Discord</label>
            <label><input type="radio" name="mode" data-field="mode" value="playnite" ${
              this._config.mode === "playnite" ? "checked" : ""
            }> Playnite</label>
            <label><input type="radio" name="mode" data-field="mode" value="custom" ${
              this._config.mode === "custom" ? "checked" : ""
            }> Custom</label>
        </div></div><hr>
        <div><div class="section-title">Color Mode</div><div class="radio-group">
            <label><input type="radio" name="color_mode" data-field="color_mode" value="game" ${
              this._config.color_mode !== "platform" ? "checked" : ""
            }> Game Artwork (Dynamic)</label>
            <label><input type="radio" name="color_mode" data-field="color_mode" value="platform" ${
              this._config.color_mode === "platform" ? "checked" : ""
            }> Platform Native (Pre-Defined)</label>
        </div></div><hr>
        <div><div class="section-title">Offline Image Style</div><div class="radio-group">
            <label><input type="radio" name="offline_image" data-field="offline_image" value="game" ${
              this._config.offline_image !== "avatar" ? "checked" : ""
            }> Last Played Game Artwork</label>
            <label><input type="radio" name="offline_image" data-field="offline_image" value="avatar" ${
              this._config.offline_image === "avatar" ? "checked" : ""
            }> Player Avatar</label>
        </div></div><hr>
        <div><div class="section-title">Sort By</div><div class="radio-group">
            <label><input type="radio" name="sort" data-field="sort_by" value="last_online" ${
              this._config.sort_by === "last_online" || !this._config.sort_by
                ? "checked"
                : ""
            }> Last Online</label>
            <label><input type="radio" name="sort" data-field="sort_by" value="name" ${
              this._config.sort_by === "name" ? "checked" : ""
            }> Name</label>
            <label><input type="radio" name="sort" data-field="sort_by" value="state" ${
              this._config.sort_by === "state" ? "checked" : ""
            }> Game Title</label>
        </div></div><hr>
        <div><div class="section-title">Visibility Options</div>
          <label><input type="checkbox" data-field="show_badges" ${
            this._config.show_badges !== false ? "checked" : ""
          }> Show Platform Badges</label>
          <label style="margin-top: 10px;"><input type="checkbox" data-field="show_text_shadow" ${
            this._config.show_text_shadow !== false ? "checked" : ""
          }> Show Text Shadow</label>
        </div><hr>
        <div>
          <div class="section-title">Maximum Visible Players</div>
          <div class="helper-text">Leave blank to show all players. Enter a number to restrict the visible height and enable a dynamic scrollbar.</div>
          <input type="number" id="max-players-input" data-field="max_visible_players" value="${
            this._config.max_visible_players || ""
          }" placeholder="e.g. 3" min="1">
        </div><hr>
        <div>
          <div class="section-title">Manual Entities (Advanced)</div>
          <div class="helper-text">Leave blank to automatically grab all sensors. To restrict this card to specific people, enter a comma-separated list of exact entity IDs (e.g. <code>sensor.gaming_status_jack_master, sensor.gaming_status_jill_master</code>).</div>
          <input type="text" id="manual-entities-input" data-field="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="sensor.gaming_status_jack_master, ...">
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('input').forEach((input) => {
      input.addEventListener("change", (ev) => {
        if (!this._config) return;
        const target = ev.target;
        let value = target.type === "checkbox" ? target.checked : target.value;
        this._config = {
          ...this._config,
          [target.dataset.field]: value,
        };
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
          })
        );
      });
    });
  }
}

// ====================================================================
// CARD 2: GAMING STATUS - SLIDESHOW
// ====================================================================

class GamingSlideshowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-slideshow-card-editor");
  }

  static getStubConfig() {
    return {
      aspect_ratio: "",
      artwork_type: "hero",
      time_per_slide: 5,
      transition_time: 1,
      show_avatars: true,
      auto_hide: true,
      include_plex: false,
      manual_entities: "",
      entities_pattern: "_master",
    };
  }

  setConfig(config) {
    this.config = {
      aspect_ratio: config.aspect_ratio !== undefined ? config.aspect_ratio : "",
      artwork_type: config.artwork_type || "hero",
      time_per_slide:
        config.time_per_slide !== undefined ? config.time_per_slide : 5,
      transition_time:
        config.transition_time !== undefined ? config.transition_time : 1,
      show_avatars: config.show_avatars !== false,
      auto_hide: config.auto_hide !== false,
      include_plex: config.include_plex === true,
      manual_entities: config.manual_entities || "",
      entities_pattern: config.entities_pattern || "_master",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let rawEntities = [];

    if (
      this.config.manual_entities &&
      this.config.manual_entities.trim() !== ""
    ) {
      const entityIds = this.config.manual_entities
        .split(",")
        .map((e) => e.trim());
      for (const id of entityIds) {
        if (hass.states[id]) {
          rawEntities.push(hass.states[id]);
        }
      }
    } else {
      for (const entityId in hass.states) {
        if (
          (entityId.startsWith("sensor.gaming_status_") || entityId.startsWith("binary_sensor.gaming_status_")) &&
          (entityId.endsWith(this.config.entities_pattern) || entityId.includes("anyone_gaming")) &&
          hass.states[entityId].attributes.secondary !== undefined
        ) {
          rawEntities.push(hass.states[entityId]);
        }
      }
    }

    if (this.config.include_plex) {
      for (const entityId in hass.states) {
        if (
          entityId.startsWith("sensor.plex_session_") &&
          entityId.includes("_tautulli")
        ) {
          if (!rawEntities.some((e) => e.entity_id === entityId)) {
            rawEntities.push(hass.states[entityId]);
          }
        }
      }
    }

    const processedData = this.processData(rawEntities);
    
    // Hash the actual visual output to prevent animation resets when timestamps tick
    const dataHash = JSON.stringify(processedData);
    if (this._lastHash === dataHash) return;
    this._lastHash = dataHash;

    this.render(processedData);
  }

  getEffectiveAspectRatio() {
    if (this.config.aspect_ratio && String(this.config.aspect_ratio).trim() !== "") {
      return this.config.aspect_ratio;
    }
    switch(this.config.artwork_type) {
      case "cover": return "600/900";
      case "logo": return "16/9";
      case "icon": return "1/1";
      case "hero":
      default: return "3840/1240";
    }
  }

  processData(entities) {
    let active_items = [];
    entities.forEach((entity) => {
      const state = entity.state.toLowerCase();
      const isPlex =
        entity.entity_id.startsWith("sensor.plex_session_") &&
        entity.entity_id.includes("_tautulli");

      if (isPlex) {
        if (["playing", "paused", "buffering"].includes(state)) {
          const gameName =
            entity.attributes.full_title || entity.attributes.friendly_name;
          const gameArt =
            entity.attributes.art_url || entity.attributes.image_url;
          const username =
            entity.attributes.username || entity.attributes.user || "Plex";
          const initial = username.charAt(0).toUpperCase();
          const badge = { isImage: false, content: initial };

          if (gameName && gameArt) {
            let existing = active_items.find((i) => i.name === gameName);
            if (existing) {
              if (!existing.players.find((p) => p.content === badge.content)) {
                existing.players.push(badge);
              }
            } else {
              active_items.push({
                name: gameName,
                art: gameArt,
                players: [badge],
              });
            }
          }
        }
      } else {
        const isOffline = ["offline", "unavailable", "unknown", "idle"].includes(state);
        const isHistory = state.includes("last seen") || state.includes("ago");

        if (!isOffline && !isHistory) {
          const gameName = entity.attributes.current_game;
          
          let gameArt = null;
          if (this.config.artwork_type === "cover") gameArt = entity.attributes.game_cover_art;
          else if (this.config.artwork_type === "logo") gameArt = entity.attributes.game_logo_art;
          else if (this.config.artwork_type === "icon") gameArt = entity.attributes.game_icon_art;
          else gameArt = entity.attributes.game_hero_art;

          if (!gameArt) {
            gameArt = entity.attributes.game_hero_art || entity.attributes.game_cover_art;
          }

          const pic = entity.attributes.entity_picture;
          const badge = pic ? { isImage: true, content: pic } : null;

          if (gameName && gameArt) {
            let existing = active_items.find((i) => i.name === gameName);
            if (existing) {
              if (
                badge &&
                !existing.players.find((p) => p.content === badge.content)
              ) {
                existing.players.push(badge);
              }
            } else {
              active_items.push({
                name: gameName,
                art: gameArt,
                players: badge ? [badge] : [],
              });
            }
          }
        }
      }
    });
    return active_items;
  }

  render(data) {
    const activeAspectRatio = this.getEffectiveAspectRatio();

    if (data.length === 0) {
      if (this.config.auto_hide) {
        this.style.display = "none";
        if (this.content) this.content.innerHTML = "";
        return;
      } else {
        this.style.display = "block";
        if (!this.content) {
          this.shadowRoot.innerHTML = `
            <ha-card id="slideshow-container" style="
              width: 100%; border-radius: var(--ha-card-border-radius, 12px); 
              position: relative; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0px 5px 15px rgba(0,0,0,0.5));
              background: var(--card-background-color, #1e1e1e);
            "></ha-card>`;
          this.content = this.shadowRoot.getElementById("slideshow-container");
        }
        this.content.style.aspectRatio = activeAspectRatio;
        this.content.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); color: var(--secondary-text-color, #888);">
            <ha-icon icon="mdi:gamepad-variant-outline" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 8px;"></ha-icon>
            <div style="font-size: 16px; font-weight: 500; opacity: 0.7;">No active games</div>
          </div>`;
        return;
      }
    } else {
      this.style.display = "block";
    }

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <ha-card id="slideshow-container" style="
          width: 100%; border-radius: var(--ha-card-border-radius, 12px); 
          position: relative; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0px 5px 15px rgba(0,0,0,0.5));
          background: #000;
        "></ha-card>`;
      this.content = this.shadowRoot.getElementById("slideshow-container");
    }
    
    this.content.style.aspectRatio = activeAspectRatio;

    const bgSize = (this.config.artwork_type === "logo" || this.config.artwork_type === "icon") ? "contain" : "cover";
    const bgRepeat = "no-repeat";

    const getAvatarHtml = (players) => {
      if (!this.config.show_avatars || !players || players.length === 0)
        return "";
      let html = `<div style="position: absolute; bottom: 10px; right: 10px; display: flex; z-index: 2;">`;
      players.forEach((badge) => {
        if (badge && badge.isImage && badge.content) {
          html += `<div style="width: 40px; height: 40px; border-radius: 50%; background-image: url('${badge.content}'); background-size: cover; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5); margin-left: 5px;"></div>`;
        } else if (badge && !badge.isImage && badge.content) {
          html += `<div style="width: 40px; height: 40px; border-radius: 50%; background-color: rgba(30, 30, 30, 0.8); color: white; font-family: sans-serif; font-size: 22px; font-weight: bold; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5); margin-left: 5px;">${badge.content}</div>`;
        }
      });
      html += `</div>`;
      return html;
    };

    if (data.length === 1) {
      this.content.innerHTML = `
        <div style="width: 100%; height: 100%; background-image: url('${data[0].art}'); background-size: ${bgSize}; background-repeat: ${bgRepeat}; background-position: center;"></div>
        ${getAvatarHtml(data[0].players)}
      `;
      return;
    }

    const t_slide = parseFloat(this.config.time_per_slide);
    const t_trans = parseFloat(this.config.transition_time);
    const loop_duration = data.length * t_slide;
    
    // Advanced Crossfade Math with Z-Index Swapping to fix the loop wrap "pop"
    const a = (t_trans / loop_duration) * 100;
    const b = (t_slide / loop_duration) * 100;
    const b_drop = Math.min(b + 0.001, 99.8);
    const c = Math.min(Math.max(((t_slide + t_trans) / loop_duration) * 100, b_drop + 0.001), 99.9);
    const c_hide = Math.min(c + 0.001, 100);

    const item_ids = data
      .map((g) => g.name.replace(/[^a-zA-Z0-9]/g, ""))
      .join("");
    const anim_name = `anim_${item_ids}`;

    // Eliminate first-load flash by setting the first slide as the static container background
    this.content.style.backgroundImage = `url('${data[0].art}')`;
    this.content.style.backgroundSize = bgSize;
    this.content.style.backgroundPosition = "center";
    this.content.style.backgroundRepeat = bgRepeat;

    let html = `<style>
      @keyframes ${anim_name} {
        0% { opacity: 0; z-index: 2; }
        ${a}% { opacity: 1; z-index: 2; }
        ${b}% { opacity: 1; z-index: 2; }
        ${b_drop}% { opacity: 1; z-index: 1; }
        ${c}% { opacity: 1; z-index: 1; }
        ${c_hide}% { opacity: 0; z-index: 1; }
        100% { opacity: 0; z-index: 1; }
      }
    </style>`;

    data.forEach((g, index) => {
      const delay = index * t_slide;
      html += `
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; z-index: 1; animation: ${anim_name} ${loop_duration}s infinite; animation-delay: ${delay}s;">
          <div style="width: 100%; height: 100%; background-image: url('${g.art}'); background-size: ${bgSize}; background-repeat: ${bgRepeat}; background-position: center;"></div>
          ${getAvatarHtml(g.players)}
        </div>`;
    });

    this.content.innerHTML = html;
  }
  getCardSize() {
    return 4;
  }
}

class GamingSlideshowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this._config = config;
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
  }

  render() {
    if (!this._config) return;
    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], input[type="number"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
      </style>
      <div class="editor-container">
        
        <div>
          <div class="section-title">Artwork Type</div>
          <select id="artwork-type-input" .configValue="artwork_type">
            <option value="hero" ${this._config.artwork_type === "hero" || !this._config.artwork_type ? "selected" : ""}>Hero (Horizontal Landscape)</option>
            <option value="cover" ${this._config.artwork_type === "cover" ? "selected" : ""}>Cover/Grid (Vertical Portrait)</option>
            <option value="logo" ${this._config.artwork_type === "logo" ? "selected" : ""}>Logo (Transparent Title)</option>
            <option value="icon" ${this._config.artwork_type === "icon" ? "selected" : ""}>Icon (Small Square)</option>
          </select>
        </div>

        <div>
          <div class="section-title">Aspect Ratio Override</div>
          <div class="helper-text">Leave blank to automatically use the default ratio for your selected artwork style.</div>
          <input type="text" id="aspect-input" .configValue="aspect_ratio" value="${
            this._config.aspect_ratio || ""
          }" placeholder="e.g. 16/9">
        </div>

        <div><div class="section-title">Time Per Slide (Seconds)</div><input type="number" id="time-input" .configValue="time_per_slide" value="${
          this._config.time_per_slide !== undefined
            ? this._config.time_per_slide
            : 5
        }" min="1"></div>
        <div><div class="section-title">Transition Fade Time (Seconds)</div><input type="number" id="transition-input" .configValue="transition_time" value="${
          this._config.transition_time !== undefined
            ? this._config.transition_time
            : 1
        }" min="0"></div>
        <hr>
        <div>
          <label><input type="checkbox" .configValue="show_avatars" ${
            this._config.show_avatars !== false ? "checked" : ""
          }> Show Player Avatars</label>
          <label style="margin-top: 10px;"><input type="checkbox" .configValue="auto_hide" ${
            this._config.auto_hide !== false ? "checked" : ""
          }> Auto-hide card when empty</label>
          <label style="margin-top: 10px;"><input type="checkbox" .configValue="include_plex" ${
            this._config.include_plex === true ? "checked" : ""
          }> Include Plex/Tautulli Sessions</label>
        </div><hr>
        <div>
          <div class="section-title">Manual Entities (Advanced)</div>
          <div class="helper-text">Leave blank to automatically grab all sensors, or restrict by entering comma-separated IDs.</div>
          <input type="text" id="manual-entities-input-slide" .configValue="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="sensor.gaming_status_jack_master, ...">
        </div>
      </div>
    `;

    const typeInput = this.shadowRoot.getElementById("artwork-type-input");
    typeInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, artwork_type: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const aspectInput = this.shadowRoot.getElementById("aspect-input");
    aspectInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, aspect_ratio: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const timeInput = this.shadowRoot.getElementById("time-input");
    timeInput.addEventListener("change", (ev) => {
      this._config = {
        ...this._config,
        time_per_slide: parseFloat(ev.target.value),
      };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const transInput = this.shadowRoot.getElementById("transition-input");
    transInput.addEventListener("change", (ev) => {
      this._config = {
        ...this._config,
        transition_time: parseFloat(ev.target.value),
      };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const manualInput = this.shadowRoot.getElementById(
      "manual-entities-input-slide"
    );
    manualInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, manual_entities: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    this.shadowRoot
      .querySelectorAll('input[type="checkbox"]')
      .forEach((input) => {
        input.addEventListener("change", (ev) => {
          if (!this._config) return;
          this._config = {
            ...this._config,
            [ev.target.getAttribute(".configValue")]: ev.target.checked,
          };
          this.dispatchEvent(
            new CustomEvent("config-changed", {
              detail: { config: this._config },
              bubbles: true,
              composed: true,
            })
          );
        });
      });
  }
}

// ====================================================================
// CARD 3: GAMING STATUS - CHART
// ====================================================================

class GamingStatusChartCard extends HTMLElement {
  constructor() {
    super();
    this.defaultPalette = [
      "rgb(255, 190, 11)",
      "rgb(251, 86, 7)",
      "rgb(255, 0, 110)",
      "rgb(131, 56, 236)",
      "rgb(58, 134, 255)",
      "rgb(56, 176, 0)",
    ];
  }

  static getConfigElement() {
    return document.createElement("gaming-status-chart-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      manual_entities: "",
      custom_colors: "",
      entities_pattern: "_master",
    };
  }

  setConfig(config) {
    this.config = {
      title: config.title || "",
      manual_entities: config.manual_entities || "",
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_master",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let targetEntities = [];
    if (
      this.config.manual_entities &&
      this.config.manual_entities.trim() !== ""
    ) {
      const entityIds = this.config.manual_entities
        .split(",")
        .map((e) => e.trim());
      targetEntities = entityIds.filter((id) => hass.states[id]);
    } else {
      targetEntities = Object.keys(hass.states).filter(
        (key) =>
          (key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) &&
          (key.endsWith(this.config.entities_pattern) || key.includes("anyone_gaming")) &&
          hass.states[key].attributes.secondary !== undefined
      );
    }
    targetEntities.sort();

    const rosterHash = targetEntities.join(",") + this.config.custom_colors;
    if (this._lastRoster !== rosterHash) {
      this._lastRoster = rosterHash;
      this.renderChart(targetEntities, hass);
    } else if (this.chartElement) {
      this.chartElement.hass = hass;
    }
  }

  renderChart(entities, hass) {
    if (!this.chartElement) {
      this.chartElement = document.createElement("apexcharts-card");
      this.appendChild(this.chartElement);
    }

    let activePalette = this.defaultPalette;
    if (this.config.custom_colors && this.config.custom_colors.trim() !== "") {
      activePalette = this.config.custom_colors
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);
    }

    let dynamicSeries = [];

    entities.forEach((entityId, index) => {
      const stateObj = hass.states[entityId];
      if (!stateObj) return;

      const friendlyName = (
        stateObj.attributes.friendly_name || entityId
      ).replace(/ Gaming Status| Master/gi, "");
      const assignedColor = activePalette[index % activePalette.length];

      // 1. The Header Series (Text Only)
      dynamicSeries.push({
        entity: entityId,
        attribute: "rolling_weekly_hours",
        name: friendlyName,
        color: assignedColor,
        show: { in_header: true, in_chart: false },
      });

      // 2. The Column Series (Graph Only)
      const chartEntityId = entityId.replace("_master", "_chart");
      
      dynamicSeries.push({
        entity: chartEntityId, 
        name: friendlyName + " \u200B", 
        type: "column",
        color: assignedColor,
        show: { in_header: false, in_chart: true },
        extend_to: "now", 
        group_by: { func: "last", duration: "1d", fill: "zero" } 
      });
    });

    const apexConfig = {
      type: "custom:apexcharts-card",
      cache: false,
      update_interval: "1m",
      header: {
        show: true,
        show_states: true,
        colorize_states: true,
        title: this.config.title || undefined,
      },
      graph_span: "8d",
      span: { end: "day", offset: "+1d" }, 
      apex_config: {
        fill: {
          opacity: 1,
          type: "gradient",
          gradient: {
            type: "vertical",
            shadeIntensity: 0,
            opacityFrom: 1,
            opacityTo: 0.5,
            stops: [0, 95, 100],
          },
        },
        chart: {
          height: "350px",
          parentHeightOffset: 10,
          toolbar: { show: false },
          zoom: { enabled: false },
        },
        grid: { padding: { left: 0, right: 0 } },
        xaxis: {
          type: "datetime",
          labels: {
            hideOverlappingLabels: false,
            datetimeFormatter: { year: "dd", month: "dd", day: "dd" },
            trim: false,
          },
          tooltip: { enabled: false },
        },
        legend: { show: false },
        tooltip: { x: { format: "dd", show: false } },
      },
      series: dynamicSeries,
      grid_options: { columns: 24, rows: "auto" },
    };

    this.chartElement.setConfig(apexConfig);
    this.chartElement.hass = hass;
  }

  getCardSize() {
    return 6;
  }
}

class GamingStatusChartEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this._config = config;
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
  }

  render() {
    if (!this._config) return;
    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"] { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus { outline: none; border-color: var(--primary-color); }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
        .warning { background: rgba(255,165,0,0.2); padding: 10px; border-radius: 4px; border-left: 4px solid orange; font-size: 13px; }
      </style>
      <div class="editor-container">
        
        <div class="warning">
          <strong>Note:</strong> This wrapper card requires the popular <code>apexcharts-card</code> to be installed via HACS in order to render the graphical data.
        </div>

        <div>
          <div class="section-title">Chart Title (Optional)</div>
          <input type="text" id="title-input-chart" .configValue="title" value="${
            this._config.title || ""
          }">
        </div>

        <hr>

        <div>
          <div class="section-title">Manual Entities (Advanced)</div>
          <div class="helper-text">Leave blank to automatically chart all sensors, or restrict by entering comma-separated IDs.</div>
          <input type="text" id="manual-entities-input-chart" .configValue="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="sensor.gaming_status_jack_master, ...">
        </div>

        <hr>

        <div>
          <div class="section-title">Custom Colors (Advanced)</div>
          <div class="helper-text">Leave blank to use the default vibrant palette. Override by entering a comma-separated list of colors (Hex, RGB, or names like <code>red, #00FF00, rgb(0,0,255)</code>).</div>
          <input type="text" id="custom-colors-input-chart" .configValue="custom_colors" value="${
            this._config.custom_colors || ""
          }" placeholder="#ffbe0b, #fb5607, ...">
        </div>

      </div>
    `;

    const titleInput = this.shadowRoot.getElementById("title-input-chart");
    titleInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, title: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const manualInput = this.shadowRoot.getElementById(
      "manual-entities-input-chart"
    );
    manualInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, manual_entities: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const colorInput = this.shadowRoot.getElementById(
      "custom-colors-input-chart"
    );
    colorInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, custom_colors: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });
  }
}

// ====================================================================
// CARD 4: GAMING STATUS - DONUT
// ====================================================================

class GamingStatusDonutCard extends HTMLElement {
  constructor() { 
    super(); 
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card style="padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e));">
        <div id="card-title" style="font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none;"></div>
        <div id="container" style="--ha-card-background: transparent; --ha-card-box-shadow: none; --ha-card-border-width: 0px; --ha-card-border-radius: 0px;"></div>
      </ha-card>
    `;
    this.container = this.shadowRoot.getElementById("container");
    this.titleEl = this.shadowRoot.getElementById("card-title");
    this.defaultPalette = [
      "rgb(255, 190, 11)",
      "rgb(251, 86, 7)",
      "rgb(255, 0, 110)",
      "rgb(131, 56, 236)",
      "rgb(58, 134, 255)",
      "rgb(56, 176, 0)",
    ];
  }

  static getConfigElement() { return document.createElement("gaming-status-donut-editor"); }

  static getStubConfig() {
    return { 
      title: "", 
      metric: "platforms",
      mode: "all", 
      single_entity: "",
      selected_entities: "",
      custom_colors: "",
      entities_pattern: "_master"
    };
  }

  setConfig(config) {
    let mode = config.mode || "all";
    let single_entity = config.single_entity || config.entity || "";

    if (config.metric === "hours" && mode === "single") {
      mode = "all";
    }

    this.config = { 
      title: config.title || "", 
      metric: config.metric || "platforms",
      mode: mode, 
      single_entity: single_entity, 
      selected_entities: config.selected_entities || "",
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_master",
      ...config 
    };
    
    if (this.titleEl) {
        this.titleEl.innerText = this.config.title;
        this.titleEl.style.display = this.config.title ? "block" : "none";
    }
    
    this.renderChart();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.chartElement) {
      this.chartElement.hass = hass;
    } else {
      this.renderChart();
    }
  }

  renderChart() {
    if (!this.config || !this._hass || this.chartElement) return;

    if (!customElements.get('apexcharts-card')) {
      console.warn("ApexCharts Card not loaded yet, waiting...");
      return;
    }

    this.chartElement = document.createElement("apexcharts-card");
    this.container.appendChild(this.chartElement);

    let entityIdsToProcess = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (this._hass.states[this.config.single_entity]) entityIdsToProcess.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIdsToProcess = this.config.selected_entities.split(',').map(e => e.trim()).filter(e => this._hass.states[e]);
    } else {
      const targetSuffix = this.config.entities_pattern || "_master";
      for (const key in this._hass.states) {
        if ((key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) && key.endsWith(targetSuffix) && this._hass.states[key].attributes.secondary !== undefined) {
          entityIdsToProcess.push(key);
        }
      }
    }
    entityIdsToProcess.sort();

    let activePalette = this.defaultPalette;
    const hasCustomColors = this.config.custom_colors && this.config.custom_colors.trim() !== "";
    if (hasCustomColors) {
      activePalette = this.config.custom_colors.split(",").map(c => c.trim()).filter(c => c);
    }

    let series = [];

    if (this.config.metric === "hours") {
      entityIdsToProcess.forEach((entityId, index) => {
        const stateObj = this._hass.states[entityId];
        if (!stateObj) return;

        const friendlyName = (stateObj.attributes.friendly_name || entityId).replace(/ Gaming Status| Master/gi, "");
        const color = activePalette[index % activePalette.length];

        series.push({
          entity: entityId,
          name: friendlyName,
          color: color,
          data_generator: `const attr = entity.attributes; const val = parseFloat(attr.${this.config.window === "calendar" ? "total_weekly_hours" : "rolling_weekly_hours"}) || 0; return val > 0 ? [[new Date().getTime(), val]] : [];`
        });
      });

    } else {
      const platforms = [
        { name: "Xbox", key: "Xbox", color: "rgb(11, 124, 16)" },
        { name: "PlayStation", key: "PlayStation", color: "rgb(0, 48, 135)" },
        { name: "PC", key: "PC", color: "rgb(2, 173, 239)" }
      ];

      const targetEntitiesStr = JSON.stringify(entityIdsToProcess);

      series = platforms.map((p, index) => {
        const color = hasCustomColors ? activePalette[index % activePalette.length] : p.color;

        const generator = `
          let total = 0;
          const targets = ${targetEntitiesStr};
          targets.forEach(key => {
            if (hass.states[key]) {
              const attr = hass.states[key].attributes;
              const hours_target = '${this.config.window === "calendar" ? "total_weekly_hours" : "rolling_weekly_hours"}';
              if (attr.platform_split && attr.platform_split['${p.key}'] && attr[hours_target]) {
                total += (parseFloat(attr.platform_split['${p.key}']) / 100) * parseFloat(attr[hours_target]);
              }
            }
          });
          return total > 0 ? [[new Date().getTime(), total]] : [];
        `;

        return {
          entity: "sensor.gaming_status_players_online", 
          name: p.name,
          color: color,
          data_generator: generator
        };
      });
    }

    const apexConfig = {
      type: "custom:apexcharts-card",
      chart_type: "donut",
      update_interval: "5m",
      header: {
        show: false
      },
      apex_config: {
        chart: { 
          height: 240, 
          fontFamily: "var(--primary-font-family)",
          events: {
             mounted: (chartContext, config) => {
               const legend = chartContext.el.querySelector('.apexcharts-legend');
               if (legend) legend.style.left = '0px';
             }
          }
        },
        tooltip: { enabled: false },
        legend: { 
          position: "left", 
          fontSize: "14px", 
          offsetX: -10, 
          offsetY: 0, 
          width: 140,
          itemMargin: { vertical: 6 }, 
          markers: { strokeWidth: 0, offsetX: -5 } 
        },
        dataLabels: { 
          style: { fontSize: "16px" } 
        },
        stroke: { show: false },
        plotOptions: {
          pie: { 
            customScale: 0.9,
            donut: { 
              size: "50%", 
              labels: { 
                show: true, 
                name: { show: false }, 
                value: { 
                  show: true, 
                  offsetY: 8, 
                  fontSize: "22px",
                  formatter: "EVAL:function(val) { return parseFloat(val).toFixed(1) + 'h'; }"
                }, 
                total: { 
                  show: true, 
                  showAlways: true, 
                  label: "Total", 
                  formatter: "EVAL:function(w) { return w.globals.seriesTotals.reduce((a, b) => a + b, 0).toFixed(1) + 'h' }" 
                } 
              } 
            } 
          }
        }
      },
      series: series
    };

    this.chartElement.setConfig(apexConfig);
    this.chartElement.hass = this._hass;
  }
}

class GamingStatusDonutEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  
  setConfig(config) { 
    let mode = config.mode || "all";
    let single_entity = config.single_entity || config.entity || "";
    this._config = { ...config, mode, single_entity }; 
    this.render(); 
  }
  
  set hass(hass) { 
    const firstLoad = !this._hass;
    this._hass = hass; 
    if (firstLoad) this.render();
  }

  render() {
    if (!this._hass || !this._config) return;

    const targetSuffix = this._config.entities_pattern || "_master";
    const entityOptions = Object.keys(this._hass.states)
      .filter(key => key.endsWith(targetSuffix) && this._hass.states[key].attributes.secondary !== undefined)
      .map(key => {
        const rawName = this._hass.states[key].attributes.friendly_name || key;
        const cleanName = rawName.replace(/ Gaming Status| Master/gi, "");
        return `<option value="${key}" ${this._config.single_entity === key ? 'selected' : ''}>${cleanName}</option>`;
      }).join('');

    const isHoursMetric = this._config.metric === 'hours';

    this.shadowRoot.innerHTML = `
      <style>
        .container { display: flex; flex-direction: column; gap: 15px; color: var(--primary-text-color); }
        select, input { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; font-weight: normal; color: var(--secondary-text-color); margin-top: 2px; }
        .warning { background: rgba(255,165,0,0.2); padding: 10px; border-radius: 4px; border-left: 4px solid orange; font-size: 13px; }
      </style>
      <div class="container">
        
        <div class="warning">
          <strong>Note:</strong> This wrapper card requires the popular <code>apexcharts-card</code> to be installed via HACS in order to render the graphical data.
        </div>

        <label>Card Title (Optional):
          <input type="text" id="title" .configValue="title" value="${this._config.title !== undefined ? this._config.title : ''}">
        </label>

        <label>Chart Metric:
          <select id="metric" .configValue="metric">
            <option value="platforms" ${this._config.metric === 'platforms' || !this._config.metric ? 'selected' : ''}>Platform Split (Xbox, PlayStation, PC)</option>
            <option value="hours" ${isHoursMetric ? 'selected' : ''}>Most Played Hours (By Player)</option>
          </select>
        </label>

        <label>Time Window:
          <select id="window" .configValue="window">
            <option value="rolling" ${this._config.window !== 'calendar' ? 'selected' : ''}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === 'calendar' ? 'selected' : ''}>Calendar (Since Sunday)</option>
          </select>
        </label>

        <label>Player Filter Mode:
          <select id="mode" .configValue="mode">
            <option value="all" ${this._config.mode === 'all' || !this._config.mode ? 'selected' : ''}>All Tracked Players</option>
            <option value="single" ${this._config.mode === 'single' ? 'selected' : ''} ${isHoursMetric ? 'disabled hidden' : ''}>Single Player</option>
            <option value="selected" ${this._config.mode === 'selected' ? 'selected' : ''}>Selected Players</option>
          </select>
        </label>

        <div id="single-selector" style="display: ${this._config.mode === 'single' ? 'block' : 'none'}">
          <label>Select Player: 
            <select id="single_entity" .configValue="single_entity">
              <option value="" disabled ${!this._config.single_entity ? 'selected' : ''}>Select a player...</option>
              ${entityOptions}
            </select>
          </label>
        </div>

        <div id="selected-selector" style="display: ${this._config.mode === 'selected' ? 'block' : 'none'}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" .configValue="selected_entities" value="${this._config.selected_entities || ''}" placeholder="sensor.gaming_status_jack_master, ...">
            <span class="helper-text">Enter a comma-separated list of exact entity IDs.</span>
          </label>
        </div>

        <hr>

        <label>Custom Colors (Advanced):
          <input type="text" id="custom_colors" .configValue="custom_colors" value="${this._config.custom_colors || ''}" placeholder="#ffbe0b, #fb5607, ...">
          <span class="helper-text">Leave blank to use default colors. For Platform Mode, leaving blank uses native brand colors. Override by entering a comma-separated list.</span>
        </label>

      </div>
    `;

    this.shadowRoot.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', e => {
        const field = e.target.getAttribute('.configValue');
        let value = e.target.value;
        
        if (field === 'metric' && value === 'hours' && this._config.mode === 'single') {
          this._config = { ...this._config, mode: 'all' };
        }

        this._config = { ...this._config, [field]: value };

        this.dispatchEvent(new CustomEvent("config-changed", { 
          detail: { config: this._config }, 
          bubbles: true, 
          composed: true 
        }));
        
        this.render();
      });
    });
  }
}

// ====================================================================
// CARD 5: GAMING STATUS - LEADERBOARD
// ====================================================================

class GamingStatusLeaderboardCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.defaultPalette = [
      "rgb(255, 190, 11)",
      "rgb(251, 86, 7)",
      "rgb(255, 0, 110)",
      "rgb(131, 56, 236)",
      "rgb(58, 134, 255)",
      "rgb(56, 176, 0)",
    ];
  }

  static getConfigElement() {
    return document.createElement("gaming-status-leaderboard-editor");
  }

  static getStubConfig() {
    return {
      title: "Gaming Leaderboard",
      metric: "hours",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      max_players: "3",
      custom_colors: "",
      entities_pattern: "_master"
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this.config = {
      title: config.title !== undefined ? config.title : "Gaming Leaderboard",
      metric: config.metric || "hours",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || "",
      max_players: config.max_players || "3",
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_master",
      ...config
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;
    
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <ha-card style="padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e));">
          <div id="card-title" style="font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: ${this.config.title ? "block" : "none"};">${this.config.title}</div>
          <div id="chart-container" style="width: 100%;"></div>
        </ha-card>
      `;
      this.content = this.shadowRoot.getElementById("chart-container");
    }

    let entityIdsToProcess = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (hass.states[this.config.single_entity]) entityIdsToProcess.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIdsToProcess = this.config.selected_entities.split(',').map(e => e.trim()).filter(e => hass.states[e]);
    } else {
      const targetSuffix = this.config.entities_pattern || "_master";
      for (const key in hass.states) {
        if (key.startsWith("sensor.") && key.endsWith(targetSuffix) && hass.states[key].attributes.secondary !== undefined) {
          entityIdsToProcess.push(key);
        }
      }
    }

    let currentHash = "";
    for (const id of entityIdsToProcess) {
      currentHash += hass.states[id].state + hass.states[id].last_updated;
    }

    if (this._lastHash === currentHash) return;
    this._lastHash = currentHash;

    this.updateLeaderboard();
  }

  extractMinutes(timeVal) {
    if (timeVal === undefined || timeVal === null || timeVal === "None") return 0;
    if (typeof timeVal === "number") return Math.floor(timeVal / 60);
    
    const str = String(timeVal);
    let m = 0;
    const hMatch = str.match(/(\d+)\s*h/);
    const mMatch = str.match(/(\d+)\s*m/);
    if (hMatch) m += parseInt(hMatch[1]) * 60;
    if (mMatch) m += parseInt(mMatch[1]);
    return m;
  }

  formatMinutes(totalMins) {
    if (totalMins === 0) return "0m";
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  updateLeaderboard() {
    if (!this._hass || !this.content) return;
    const escapeHTML = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let entityIdsToProcess = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (this._hass.states[this.config.single_entity]) entityIdsToProcess.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIdsToProcess = this.config.selected_entities.split(',').map(e => e.trim()).filter(e => this._hass.states[e]);
    } else {
      const targetSuffix = this.config.entities_pattern || "_master";
      for (const key in this._hass.states) {
        if ((key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) && key.endsWith(targetSuffix) && this._hass.states[key].attributes.secondary !== undefined) {
          entityIdsToProcess.push(key);
        }
      }
    }

    let finalData = [];

    const isCal = this.config.window === "calendar";
    if (this.config.metric === "game_hours") {
      let gamesMap = {};
      for (const entityId of entityIdsToProcess) {
        const stateObj = this._hass.states[entityId];
        const attrTarget = isCal ? "calendar_weekly_breakdown" : "rolling_weekly_breakdown";
        const breakdown = stateObj.attributes[attrTarget] || stateObj.attributes.weekly_breakdown || stateObj.attributes.weekly_game_breakdown || {};
        for (const [game, timeStr] of Object.entries(breakdown)) {
          gamesMap[game] = (gamesMap[game] || 0) + this.extractMinutes(timeStr);
        }
      }
      for (const [game, mins] of Object.entries(gamesMap)) {
        finalData.push({
          name: game,
          value: mins,
          displayValue: this.formatMinutes(mins)
        });
      }
    } else {
      for (const entityId of entityIdsToProcess) {
        const stateObj = this._hass.states[entityId];
        const friendlyName = (stateObj.attributes.friendly_name || entityId).replace(/ Gaming Status| Master/gi, "");

        if (this.config.metric === "hours") {
          const hours = parseFloat(stateObj.attributes[isCal ? "total_weekly_hours" : "rolling_weekly_hours"]) || 0;
          finalData.push({ name: friendlyName, value: hours, displayValue: `${hours}h` });
        } 
        else if (this.config.metric === "games") {
          const attrTarget = isCal ? "calendar_weekly_breakdown" : "rolling_weekly_breakdown";
          const breakdown = stateObj.attributes[attrTarget] || stateObj.attributes.weekly_breakdown || stateObj.attributes.weekly_game_breakdown || {};
          const count = Object.keys(breakdown).length;
          finalData.push({ name: friendlyName, value: count, displayValue: `${count}` });
        } 
        else if (this.config.metric === "longest") {
          const attrTarget = isCal ? "calendar_longest_session" : "rolling_longest_session";
          const longestStr = stateObj.attributes[attrTarget] || stateObj.attributes.longest_session || "None";
          const mins = this.extractMinutes(longestStr);
          finalData.push({ name: friendlyName, value: mins, displayValue: String(longestStr) });
        }
      }
    }

    finalData.sort((a, b) => b.value - a.value);
    const limit = parseInt(this.config.max_players) || 3;
    finalData = finalData.slice(0, limit);

    if (finalData.length === 0 || finalData.every(d => d.value === 0)) {
      this.content.innerHTML = `<div style="padding: 10px; color: var(--secondary-text-color); font-style: italic;">No activity to display.</div>`;
      return;
    }

    let activePalette = this.defaultPalette;
    if (this.config.custom_colors && this.config.custom_colors.trim() !== "") {
      activePalette = this.config.custom_colors
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);
    }

    const maxValue = Math.max(...finalData.map(d => d.value));
    let html = `<div style="display: flex; flex-direction: column; gap: 14px; margin-top: 8px;">`;
    
    finalData.forEach((item, index) => {
      const color = activePalette[index % activePalette.length];
      const safeName = escapeHTML(item.name);
      const safeDisplay = escapeHTML(item.displayValue);

      if (this.config.metric === "longest") {
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border-left: 4px solid ${color}; padding-left: 8px; box-sizing: border-box;">
            <div style="flex-grow: 1; font-size: 14px; font-weight: 500; color: var(--primary-text-color); word-break: break-word;">
              ${safeName}
            </div>
            <div style="flex-shrink: 0; text-align: right; font-size: 14px; font-weight: 600; color: var(--primary-text-color);">
              ${safeDisplay}
            </div>
          </div>
        `;
      } else {
        const pct = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0;
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
            <div style="width: 110px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
              ${safeName}
            </div>
            <div style="flex-grow: 1; height: 24px; background: var(--secondary-background-color, rgba(120,120,120,0.2)); position: relative; overflow: hidden; border-radius: 0;">
              <div style="width: ${pct}%; height: 100%; background: ${color}; 
                   -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.2) 100%); 
                   mask-image: linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.2) 100%); 
                   border-radius: 0; transition: width 0.5s ease-out;">
              </div>
            </div>
            <div style="min-width: 40px; flex-shrink: 0; text-align: right; font-size: 14px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap;">
              ${safeDisplay}
            </div>
          </div>
        `;
      }
    });
    
    html += `</div>`;
    this.content.innerHTML = html;
  }

  getCardSize() { return 4; }
}

class GamingStatusLeaderboardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) { this._config = config; this.render(); }
  
  set hass(hass) { 
    const firstLoad = !this._hass;
    this._hass = hass; 
    if (firstLoad) this.render();
  }

  render() {
    if (!this._hass || !this._config) return;

    const targetSuffix = this._config.entities_pattern || "_master";
    const entityOptions = Object.keys(this._hass.states)
      .filter(key => key.endsWith(targetSuffix) && this._hass.states[key].attributes.secondary !== undefined)
      .map(key => {
        const rawName = this._hass.states[key].attributes.friendly_name || key;
        const cleanName = rawName.replace(/ Gaming Status| Master/gi, "");
        return `<option value="${key}" ${this._config.single_entity === key ? 'selected' : ''}>${cleanName}</option>`;
      }).join('');

    this.shadowRoot.innerHTML = `
      <style>
        .container { display: flex; flex-direction: column; gap: 15px; color: var(--primary-text-color); }
        select, input { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; font-weight: normal; color: var(--secondary-text-color); margin-top: 2px; }
        .info { background: rgba(0,150,255,0.1); padding: 10px; border-radius: 4px; border-left: 4px solid #0096ff; font-size: 13px; }
      </style>
      <div class="container">

        <div class="info">
          <strong>Note:</strong> This is a lightweight, native CSS card. Unlike the Chart or Donut cards, it does <strong>not</strong> require ApexCharts or any other external HACS dependencies to render.
        </div>

        <label>Card Title:
          <input type="text" id="title" .configValue="title" value="${this._config.title !== undefined ? this._config.title : ''}">
        </label>
        
        <label>Leaderboard Metric:
          <select id="metric" .configValue="metric">
            <option value="hours" ${this._config.metric === 'hours' ? 'selected' : ''}>Top Players: Most Played Hours</option>
            <option value="longest" ${this._config.metric === 'longest' ? 'selected' : ''}>Top Players: Longest Gaming Session</option>
            <option value="games" ${this._config.metric === 'games' ? 'selected' : ''}>Top Players: Most Different Games Played</option>
            <option value="game_hours" ${this._config.metric === 'game_hours' ? 'selected' : ''}>Top Games: Hours Per Game (Aggregate)</option>
          </select>
        </label>

        <label>Time Window:
          <select id="window" .configValue="window">
            <option value="rolling" ${this._config.window !== 'calendar' ? 'selected' : ''}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === 'calendar' ? 'selected' : ''}>Calendar (Since Sunday)</option>
          </select>
        </label>

        <label>Player Filter Mode:
          <select id="mode" .configValue="mode">
            <option value="all" ${this._config.mode === 'all' || !this._config.mode ? 'selected' : ''}>All Tracked Players</option>
            <option value="single" ${this._config.mode === 'single' ? 'selected' : ''}>Single Player</option>
            <option value="selected" ${this._config.mode === 'selected' ? 'selected' : ''}>Selected Players</option>
          </select>
        </label>

        <div id="single-selector" style="display: ${this._config.mode === 'single' ? 'block' : 'none'}">
          <label>Select Player: 
            <select id="single_entity" .configValue="single_entity">
              <option value="" disabled ${!this._config.single_entity ? 'selected' : ''}>Select a player...</option>
              ${entityOptions}
            </select>
          </label>
        </div>

        <div id="selected-selector" style="display: ${this._config.mode === 'selected' ? 'block' : 'none'}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" .configValue="selected_entities" value="${this._config.selected_entities || ''}" placeholder="sensor.gaming_status_jack_master, ...">
            <span class="helper-text">Enter a comma-separated list of exact entity IDs.</span>
          </label>
        </div>

        <label>Items to Display (Rows):
          <input type="number" id="max_players" .configValue="max_players" value="${this._config.max_players || '3'}" min="1" max="20">
        </label>
        
        <hr>

        <label>Custom Colors (Advanced):
          <input type="text" id="custom_colors" .configValue="custom_colors" value="${this._config.custom_colors || ''}" placeholder="#ffbe0b, #fb5607, ...">
          <span class="helper-text">Leave blank to use the default vibrant palette. Override by entering a comma-separated list of colors.</span>
        </label>
      </div>
    `;

    const singleSelector = this.shadowRoot.getElementById('single-selector');
    const selectedSelector = this.shadowRoot.getElementById('selected-selector');

    this.shadowRoot.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', e => {
        const field = e.target.getAttribute('.configValue');
        const value = e.target.value;
        
        this._config = { ...this._config, [field]: value };
        
        if (field === 'mode') {
            singleSelector.style.display = (value === 'single') ? 'block' : 'none';
            selectedSelector.style.display = (value === 'selected') ? 'block' : 'none';
        }

        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
    });
  }
}

// ====================================================================
// REGISTRATION
// ====================================================================

// Card 1
customElements.define("gaming-status-card", GamingStatusCard);
customElements.define("gaming-status-card-editor", GamingStatusCardEditor);

// Card 2
customElements.define("gaming-slideshow-card", GamingSlideshowCard);
customElements.define(
  "gaming-slideshow-card-editor",
  GamingSlideshowCardEditor
);

// Card 3
customElements.define("gaming-status-chart-card", GamingStatusChartCard);
customElements.define("gaming-status-chart-editor", GamingStatusChartEditor);

// Card 4
customElements.define("gaming-status-donut-card", GamingStatusDonutCard);
customElements.define("gaming-status-donut-editor", GamingStatusDonutEditor);

// Card 5
customElements.define("gaming-status-leaderboard-card", GamingStatusLeaderboardCard);
customElements.define("gaming-status-leaderboard-editor", GamingStatusLeaderboardEditor);

// Inject into UI
window.customCards = window.customCards || [];

window.customCards.push({
  type: "gaming-status-card",
  name: "Gaming Status - List",
  preview: true,
  description:
    "A dependency-free unified dashboard list card for gaming status.",
});

window.customCards.push({
  type: "gaming-slideshow-card",
  name: "Gaming Status - Slideshow",
  preview: true,
  description: "A dynamic CSS-animated slideshow of active game hero images.",
});

window.customCards.push({
  type: "gaming-status-chart-card",
  name: "Gaming Status - Chart",
  preview: true,
  description:
    "An automated wrapper that builds a historical gaming ApexChart.",
});

window.customCards.push({
  type: "gaming-status-donut-card",
  name: "Gaming Status - Donut",
  preview: true,
  description: "Aggregated or single-player donut chart for gaming platform stats."
});

window.customCards.push({
  type: "gaming-status-leaderboard-card",
  name: "Gaming Status - Leaderboard",
  preview: true,
  description: "A dynamic standalone bar graph ranking the top players across chosen metrics."
});