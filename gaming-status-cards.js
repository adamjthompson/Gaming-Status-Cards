// ====================================================================
// SHARED: NAMED COLOR PALETTES
// ====================================================================

const GAMING_STATUS_PALETTES = {
  vivid: {
    label: "Vivid (Default)",
    colors: ["#FFBE0B", "#FB5607", "#FF006E", "#8338EC", "#3A86FF", "#38B000", "#AF0E8E", "#A428BD", "#B71A2A", "#5329FA"],
  },
  material: {
    label: "Material",
    colors: ["#BB1B1B", "#1453FF", "#AA0E95", "#04A45F", "#A467E9", "#C91D78", "#D16B05", "#57A117", "#9C0FB8", "#8161FF"],
  },
  muted: {
    label: "Muted",
    colors: ["#A55050", "#575BDB", "#8B8B1D", "#7F4186", "#8A6BC7", "#D63D80", "#417722", "#236CA4", "#B14F25", "#3B9B6B"],
  },
  soft: {
    label: "Soft",
    colors: ["#C63939", "#613EEF", "#D05DC4", "#9045C9", "#CD517E", "#2180ED", "#D2742D", "#EF3E67", "#E12D9F", "#3B5CE3"],
  },
};

// Normalizes a card's persisted config into an explicit color_palette value.
// Preserves pre-existing custom_colors setups for users upgrading from before this feature.
function gamingStatusNormalizePalette(config) {
  if (config.color_palette) return config.color_palette;
  return config.custom_colors && String(config.custom_colors).trim() ? "custom" : "vivid";
}

function gamingStatusResolvePalette(config) {
  if (config.color_palette === "custom") {
    const custom = (config.custom_colors || "").split(",").map(c => c.trim()).filter(Boolean);
    return custom.length ? custom : GAMING_STATUS_PALETTES.vivid.colors;
  }
  const preset = GAMING_STATUS_PALETTES[config.color_palette];
  return preset ? preset.colors : GAMING_STATUS_PALETTES.vivid.colors;
}

function gamingStatusPaletteOptionsHTML(selected) {
  const presetOpts = Object.entries(GAMING_STATUS_PALETTES)
    .map(([key, p]) => `<option value="${key}" ${selected === key ? "selected" : ""}>${p.label}</option>`)
    .join("");
  return `${presetOpts}<option value="custom" ${selected === "custom" ? "selected" : ""}>Custom Colors</option>`;
}

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
        "playnite": { icon: "https://cdn2.steamgriddb.com/icon/a281004dce23a29d1821f1e8430b6f8f.png", color: "255, 88, 51" },
        "custom": { icon: "mdi:gamepad-square", color: "100, 50, 100" },
        "discord": { icon: "https://cdn2.steamgriddb.com/icon/d8a6b69c1e76aeb1500df754b7b86802.png", color: "88, 101, 242" }
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

      const friendlyName = (entity.attributes.friendly_name || entity.entity_id).replace(/ Gaming Status| Master| Chart| Steam| Xbox| PlayStation| PC| Custom| Discord| Playnite/gi, "")

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
            -webkit-mask-image: -webkit-radial-gradient(white, black);
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
      plex_source: "none",
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
      plex_source: config.plex_source || (config.include_plex ? "tautulli" : "none"),
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

    if (this.config.plex_source === "tautulli") {
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
    } else if (this.config.plex_source === "plex") {
      for (const entityId in hass.states) {
        if (entityId.startsWith("media_player.plex_")) {
          const plexState = hass.states[entityId].state;
          if (["playing", "paused"].includes(plexState)) {
            if (!rawEntities.some((e) => e.entity_id === entityId)) {
              rawEntities.push(hass.states[entityId]);
            }
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
      const isPlexNative = entity.entity_id.startsWith("media_player.plex_");
      const isPlex =
        entity.entity_id.startsWith("sensor.plex_session_") &&
        entity.entity_id.includes("_tautulli");

      if (isPlexNative) {
        if (["playing", "paused"].includes(state)) {
          const attrs = entity.attributes;
          const gameName = attrs.media_series_title || attrs.media_title;
          const gameArt = attrs.entity_picture;
          const username = attrs.username || "Plex";
          const initial = username.charAt(0).toUpperCase();
          const badge = { isImage: false, content: initial };

          if (gameName && gameArt) {
            let existing = active_items.find((i) => i.name === gameName);
            if (existing) {
              if (!existing.players.find((p) => p.content === badge.content)) {
                existing.players.push(badge);
              }
            } else {
              active_items.push({ name: gameName, art: gameArt, players: [badge] });
            }
          }
        }
      } else if (isPlex) {
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
          <div style="margin-top: 12px;">
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Plex Integration</div>
            <label style="margin-bottom: 4px;"><input type="radio" name="plex_source" value="none" ${this._config.plex_source !== "tautulli" && this._config.plex_source !== "plex" ? "checked" : ""}> None</label>
            <label style="margin-bottom: 4px;"><input type="radio" name="plex_source" value="plex" ${this._config.plex_source === "plex" ? "checked" : ""}> Plex (media_player)</label>
            <label><input type="radio" name="plex_source" value="tautulli" ${this._config.plex_source === "tautulli" ? "checked" : ""}> Tautulli (sensor)</label>
          </div>
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

    this.shadowRoot
      .querySelectorAll('input[name="plex_source"]')
      .forEach((radio) => {
        radio.addEventListener("change", (ev) => {
          if (!this._config) return;
          this._config = { ...this._config, plex_source: ev.target.value };
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
// CARD 3: GAMING STATUS - WEEKLY HOURS
// ====================================================================

class GamingStatusChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-chart-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      color_palette: "vivid",
      custom_colors: "",
      entities_pattern: "_master",
      window: "rolling",
    };
  }

  setConfig(config) {
    // Backward compat: manual_entities without mode → selected mode
    const mode = config.mode || (config.manual_entities ? "selected" : "all");
    this.config = {
      ...config,
      title: config.title || "",
      mode,
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || (mode === "selected" ? config.manual_entities || "" : ""),
      manual_entities: config.manual_entities || "",
      color_palette: gamingStatusNormalizePalette(config),
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_master",
      window: config.window || "rolling",
    };
    this._lastHash = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let entityIds = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (hass.states[this.config.single_entity]) entityIds.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIds = this.config.selected_entities.split(",").map(e => e.trim()).filter(e => hass.states[e]);
    } else {
      entityIds = Object.keys(hass.states).filter(
        k => (k.startsWith("sensor.gaming_status_") || k.startsWith("binary_sensor.gaming_status_")) &&
             k.endsWith(this.config.entities_pattern) &&
             hass.states[k].attributes.secondary !== undefined
      );
    }
    entityIds.sort();

    const hash = entityIds.map(id => `${id}:${hass.states[id]?.last_updated}`).join(",")
      + "|" + this.config.window
      + "|" + this.config.color_palette
      + "|" + this.config.custom_colors;

    if (this._lastHash === hash) return;
    this._lastHash = hash;
    this._update(entityIds);
  }

  _ensureShell() {
    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `
        <ha-card style="padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e));">
          <div id="chart-title" style="font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none;"></div>
          <div id="chart-content"></div>
        </ha-card>
        <div id="chart-tooltip" style="position:fixed;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:5px 9px;border-radius:5px;font-size:12px;white-space:nowrap;display:none;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`;
      this._titleEl = this.shadowRoot.getElementById("chart-title");
      this._contentEl = this.shadowRoot.getElementById("chart-content");
      this._tooltipEl = this.shadowRoot.getElementById("chart-tooltip");
      if (!this._ro && typeof ResizeObserver !== "undefined") {
        let rafId;
        this._ro = new ResizeObserver(() => {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs);
          });
        });
        this._ro.observe(this._contentEl);
      }
    }
    if (this._titleEl) {
      this._titleEl.textContent = this.config.title || "";
      this._titleEl.style.display = this.config.title ? "block" : "none";
    }
  }

  _update(entityIds) {
    this._ensureShell();

    const isCal = this.config.window === "calendar";
    const now = new Date();
    const days = [];
    const daysBack = isCal ? now.getDay() : 6;
    for (let i = daysBack; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    }

    const weeklyAttr = isCal ? "total_weekly_hours" : "rolling_weekly_hours";
    const playerMap = {};

    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const name = (stateObj.attributes.friendly_name || entityId).replace(/ Gaming Status| Master/gi, "").trim();
      const playHistory = stateObj.attributes.play_history || {};
      const weeklyHours = parseFloat(stateObj.attributes[weeklyAttr]) || 0;

      if (!playerMap[name]) playerMap[name] = { name, weeklyHours, daily: {} };

      for (const day of days) {
        const totalSecs = Object.values(playHistory[day] || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const h = totalSecs / 3600;
        if (h > 0) playerMap[name].daily[day] = (playerMap[name].daily[day] || 0) + h;
      }
    }

    const hideEmpty = this.config.hide_empty === true || this.config.hide_empty === "true";
    const players = Object.values(playerMap)
      .sort((a, b) => b.weeklyHours - a.weeklyHours)
      .filter(p => !hideEmpty || Object.values(p.daily).some(h => h > 0));
    const dailyData = days.map(day => {
      const entry = { day, players: {} };
      for (const p of players) {
        if (p.daily[day]) entry.players[p.name] = p.daily[day];
      }
      return entry;
    });

    this._renderChart(dailyData, players);
  }

  _renderChart(dailyData, players) {
    if (!this._contentEl) return;
    this._lastRenderArgs = [dailyData, players];
    const VW = this._contentEl.clientWidth;
    if (!VW) {
      requestAnimationFrame(() => { if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs); });
      return;
    }

    if (!players.length || dailyData.every(d => !Object.keys(d.players).length)) {
      this._contentEl.innerHTML = `<div style="padding:20px;color:var(--secondary-text-color);font-style:italic;">No game activity found for this period.</div>`;
      return;
    }

    const palette = gamingStatusResolvePalette(this.config);
    const colorOf = (i) => palette[i % palette.length];

    const padL = 42, padR = 12, padT = 8, padB = 50, areaH = 220;
    const areaW = VW - padL - padR;

    const isSingle = players.length === 1;
    const showLegend = this.config.show_legend !== false;
    const legendRowH = 22;
    let legendCols, legendH;
    if (!showLegend) {
      legendCols = 1;
      legendH = 0;
    } else if (isSingle) {
      legendCols = 1;
      legendH = 28;
    } else {
      const longestCh = players.length > 0 ? Math.max(...players.map(p => {
        const h = p.weeklyHours > 0 ? ` (${p.weeklyHours.toFixed(2)}h)` : "";
        return (p.name + h).length;
      })) : 10;
      const estItemW = Math.max(80, 17 + longestCh * 7);
      legendCols = Math.max(1, Math.min(players.length, 4, Math.floor(areaW / estItemW)));
      legendH = Math.ceil(players.length / legendCols) * legendRowH + 12;
    }
    const totalH = padT + areaH + padB + legendH;

    const maxDaily = Math.max(
      ...dailyData.map(d => players.reduce((s, p) => s + (d.players[p.name] || 0), 0)),
      0.25
    );
    const niceMax = this._niceMax(maxDaily);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => +(f * niceMax).toFixed(4));

    const n = dailyData.length || 1;
    const slotW = areaW / n;
    const barW = slotW * 0.65;
    const barOff = (slotW - barW) / 2;
    const fy = (h) => padT + areaH - (h / niceMax) * areaH;

    let svg = `<svg width="${VW}" height="${totalH}" style="display:block;" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>text{font-family:var(--primary-font-family,sans-serif)}</style>`;

    for (const tick of yTicks) {
      const y = fy(tick).toFixed(1);
      svg += `<line x1="${padL}" y1="${y}" x2="${VW - padR}" y2="${y}" stroke="rgba(128,128,128,0.15)" stroke-width="1"/>`;
      const label = tick === 0 ? "0" : tick >= 1 ? `${Math.round(tick)}h` : `${Math.round(tick * 60)}m`;
      svg += `<text x="${padL - 5}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--primary-text-color,#ddd)">${label}</text>`;
    }

    svg += `<line x1="${padL}" y1="${(padT + areaH).toFixed(1)}" x2="${VW - padR}" y2="${(padT + areaH).toFixed(1)}" stroke="rgba(128,128,128,0.3)" stroke-width="1"/>`;

    dailyData.forEach((d, i) => {
      const slotX = padL + i * slotW;
      const bx = (slotX + barOff).toFixed(1);
      const bw = barW.toFixed(1);
      let yBase = padT + areaH;

      for (let pi = players.length - 1; pi >= 0; pi--) {
        const h = d.players[players[pi].name] || 0;
        if (h <= 0) continue;
        const bh = (h / niceMax) * areaH;
        svg += `<rect x="${bx}" y="${(yBase - bh).toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" fill="${colorOf(pi)}" data-player="${this._esc(players[pi].name)}" data-hours="${h.toFixed(4)}" style="transition:opacity 0.2s ease"/>`;
        yBase -= bh;
      }

      const dt = new Date(d.day + "T12:00:00");
      const cx = (slotX + slotW / 2).toFixed(1);
      svg += `<text x="${cx}" y="${(padT + areaH + 16).toFixed(1)}" text-anchor="middle" font-size="13" fill="var(--primary-text-color,#ddd)">${dt.toLocaleDateString(undefined, { weekday: "short" })}</text>`;
      svg += `<text x="${cx}" y="${(padT + areaH + 30).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--primary-text-color,#ddd)">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
    });

    const legY0 = padT + areaH + padB + 2;
    if (showLegend) {
      if (isSingle) {
        const p = players[0];
        if (p.weeklyHours > 0) {
          svg += `<text x="${(padL + areaW / 2).toFixed(1)}" y="${legY0 + 18}" text-anchor="middle" font-size="14" fill="var(--primary-text-color,#ddd)">Total: ${p.weeklyHours.toFixed(2)}h</text>`;
        }
      } else {
        const colW = areaW / legendCols;
        players.forEach((p, i) => {
          const col = i % legendCols;
          const row = Math.floor(i / legendCols);
          const lx = padL + col * colW;
          const ly = legY0 + row * legendRowH;
          svg += `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${colorOf(i)}" rx="2" style="transition:opacity 0.2s ease" data-swatch-player="${this._esc(p.name)}"/>`;
          const hoursStr = p.weeklyHours > 0 ? ` (${p.weeklyHours.toFixed(2)}h)` : "";
          const fullLabel = p.name + hoursStr;
          const maxCh = Math.floor(colW / 7) - 2;
          const label = fullLabel.length > maxCh ? fullLabel.slice(0, maxCh - 1) + "\u2026" : fullLabel;
          svg += `<text x="${lx + 17}" y="${ly + 11}" font-size="14" fill="var(--primary-text-color,#ddd)">${this._esc(label)}</text>`;
          svg += `<rect x="${lx}" y="${ly - 2}" width="${colW - 4}" height="${legendRowH}" fill="transparent" style="cursor:pointer" data-legend-player="${this._esc(p.name)}"/>`;
        });
      }
    }

    svg += "</svg>";
    this._contentEl.innerHTML = svg;

    const tooltipEl = this._tooltipEl;
    if (tooltipEl) {
      this._contentEl.querySelectorAll("rect[data-player]").forEach(rect => {
        rect.addEventListener("mouseenter", () => {
          const totalMins = Math.round(parseFloat(rect.dataset.hours) * 60);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          const display = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
          tooltipEl.textContent = isSingle ? display : `${rect.dataset.player}: ${display}`;
          tooltipEl.style.display = "block";
        });
        rect.addEventListener("mousemove", (ev) => {
          tooltipEl.style.left = `${ev.clientX + 14}px`;
          tooltipEl.style.top = `${ev.clientY - 38}px`;
        });
        rect.addEventListener("mouseleave", () => {
          tooltipEl.style.display = "none";
        });
      });
    }

    let focusedPlayer = null;
    const applyPlayerFocus = (name) => {
      this._contentEl.querySelectorAll("rect[data-player]").forEach(r => {
        r.style.opacity = r.dataset.player === name ? "1" : "0.15";
      });
      this._contentEl.querySelectorAll("rect[data-swatch-player]").forEach(r => {
        r.style.opacity = r.dataset.swatchPlayer === name ? "1" : "0.15";
      });
    };
    const clearPlayerFocus = () => {
      this._contentEl.querySelectorAll("rect[data-player], rect[data-swatch-player]").forEach(r => {
        r.style.opacity = "1";
      });
    };
    this._contentEl.querySelectorAll("rect[data-legend-player]").forEach(hitRect => {
      const playerName = hitRect.dataset.legendPlayer;
      hitRect.addEventListener("click", () => {
        if (focusedPlayer === playerName) {
          focusedPlayer = null;
          clearPlayerFocus();
        } else {
          focusedPlayer = playerName;
          applyPlayerFocus(playerName);
        }
      });
      hitRect.addEventListener("mouseenter", () => {
        if (focusedPlayer) return;
        applyPlayerFocus(playerName);
      });
      hitRect.addEventListener("mouseleave", () => {
        if (focusedPlayer) return;
        clearPlayerFocus();
      });
    });
  }

  _niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(c => c >= v) || v * 1.25;
  }

  _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  getCardSize() { return 5; }
}

class GamingStatusChartEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }

  setConfig(config) { this._config = config; this.render(); }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.render();
  }

  render() {
    if (!this._config) return;
    const mode = this._config.mode || "all";
    const colorPalette = gamingStatusNormalizePalette(this._config);
    const targetSuffix = this._config.entities_pattern || "_master";
    const entityOptions = this._hass ? Object.keys(this._hass.states)
      .filter(k => k.endsWith(targetSuffix) && this._hass.states[k].attributes.secondary !== undefined)
      .map(k => {
        const name = (this._hass.states[k].attributes.friendly_name || k).replace(/ Gaming Status| Master/gi, "").trim();
        return `<option value="${k}" ${this._config.single_entity === k ? "selected" : ""}>${this._esc(name)}</option>`;
      }).join("") : "";

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input[type="text"]:focus, select:focus { outline: none; border-color: var(--primary-color); }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Chart Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Time Window</div>
          <select id="window">
            <option value="rolling" ${this._config.window !== "calendar" ? "selected" : ""}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === "calendar" ? "selected" : ""}>Calendar (Since Sunday)</option>
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Player Filter</div>
          <select id="mode">
            <option value="all" ${mode === "all" ? "selected" : ""}>All Tracked Players</option>
            <option value="single" ${mode === "single" ? "selected" : ""}>Single Player</option>
            <option value="selected" ${mode === "selected" ? "selected" : ""}>Selected Players</option>
          </select>
        </div>
        ${mode === "single" ? `
        <div>
          <div class="section-title">Select Player</div>
          <select id="single_entity">
            <option value="" disabled ${!this._config.single_entity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>` : ""}
        ${mode === "selected" ? `
        <div>
          <div class="section-title">Selected Entities</div>
          <div class="helper-text">Comma-separated entity IDs to include in the chart.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="sensor.gaming_status_jack_master, ...">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Color Palette</div>
          <div class="helper-text">Colors are assigned to players in order and cycle if there are more players than colors.</div>
          <select id="color_palette">${gamingStatusPaletteOptionsHTML(colorPalette)}</select>
        </div>
        ${colorPalette === "custom" ? `
        <div>
          <div class="section-title">Custom Colors (Advanced)</div>
          <div class="helper-text">Comma-separated colors (hex, RGB, or names like <code>red, #00FF00, rgb(0,0,255)</code>). A 10-color palette is recommended so colors don't repeat.</div>
          <input type="text" id="custom_colors" value="${this._esc(this._config.custom_colors || "")}" placeholder="rgb(255,190,11), rgb(58,134,255), ...">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Legend</div>
          <div class="helper-text">Hide the player legend to give more vertical space to the chart.</div>
          <select id="show_legend">
            <option value="true" ${this._config.show_legend !== false && this._config.show_legend !== "false" ? "selected" : ""}>Show Legend</option>
            <option value="false" ${this._config.show_legend === false || this._config.show_legend === "false" ? "selected" : ""}>Hide Legend</option>
          </select>
        </div>
        <div>
          <div class="section-title">Exclusions</div>
          <div class="helper-text">Exclude players with no hours in the selected time window from the chart and legend.</div>
          <select id="hide_empty">
            <option value="false" ${this._config.hide_empty !== true && this._config.hide_empty !== "true" ? "selected" : ""}>Show All Players</option>
            <option value="true" ${this._config.hide_empty === true || this._config.hide_empty === "true" ? "selected" : ""}>Hide Inactive Players</option>
          </select>
        </div>
      </div>`;

    const BOOL_FIELDS_CHART = ["show_legend", "hide_empty"];
    ["title", "window", "mode", "single_entity", "selected_entities", "color_palette", "custom_colors", "show_legend", "hide_empty"].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.addEventListener("change", ev => {
        const value = BOOL_FIELDS_CHART.includes(id) ? ev.target.value !== "false" : ev.target.value;
        this._config = { ...this._config, [id]: value };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
        this.render();
      });
    });
  }

  _esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
}

// ====================================================================
// CARD 4: GAMING STATUS - PLATFORMS
// ====================================================================

class GamingStatusDonutCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() { return document.createElement("gaming-status-donut-editor"); }

  static getStubConfig() {
    return {
      title: "",
      window: "rolling",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      manual_entities: "",
      custom_colors: "",
      entities_pattern: "_master",
    };
  }

  setConfig(config) {
    this.config = {
      title: config.title || "",
      window: config.window || "rolling",
      mode: config.mode || "all",
      single_entity: config.single_entity || config.entity || "",
      selected_entities: config.selected_entities || "",
      manual_entities: config.manual_entities || "",
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_master",
      ...config,
    };
    this._lastHash = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let entityIds = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (hass.states[this.config.single_entity]) entityIds.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIds = this.config.selected_entities.split(",").map(e => e.trim()).filter(e => hass.states[e]);
    } else {
      const manualStr = this.config.manual_entities || "";
      if (manualStr) {
        entityIds = manualStr.split(",").map(e => e.trim()).filter(e => hass.states[e]);
      } else {
        for (const key in hass.states) {
          if ((key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) &&
              key.endsWith(this.config.entities_pattern) &&
              hass.states[key].attributes.secondary !== undefined) {
            entityIds.push(key);
          }
        }
      }
    }
    entityIds.sort();

    const hash = entityIds.map(id => `${id}:${hass.states[id]?.last_updated}`).join(",")
      + "|" + this.config.window
      + "|" + this.config.custom_colors;

    if (this._lastHash === hash) return;
    this._lastHash = hash;
    this._update(entityIds);
  }

  _ensureShell() {
    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `
        <ha-card style="padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e));">
          <div id="d-title" style="font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none;"></div>
          <div id="d-content"></div>
        </ha-card>
        <div id="d-tooltip" style="position:fixed;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:5px 9px;border-radius:5px;font-size:12px;white-space:nowrap;display:none;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`;
      this._titleEl = this.shadowRoot.getElementById("d-title");
      this._contentEl = this.shadowRoot.getElementById("d-content");
      this._tooltipEl = this.shadowRoot.getElementById("d-tooltip");
      if (!this._ro && typeof ResizeObserver !== "undefined") {
        let rafId;
        this._ro = new ResizeObserver(() => {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs);
          });
        });
        this._ro.observe(this._contentEl);
      }
    }
    if (this._titleEl) {
      this._titleEl.textContent = this.config.title || "";
      this._titleEl.style.display = this.config.title ? "block" : "none";
    }
  }

  _update(entityIds) {
    this._ensureShell();

    const isCal = this.config.window === "calendar";
    const weeklyAttr = isCal ? "total_weekly_hours" : "rolling_weekly_hours";
    const hasCustom = this.config.custom_colors && this.config.custom_colors.trim();
    const customPalette = hasCustom ? this.config.custom_colors.split(",").map(c => c.trim()).filter(Boolean) : [];

    const platforms = [
      { name: "Xbox",        key: "Xbox",        color: customPalette[0] || "rgb(11, 124, 16)"  },
      { name: "PlayStation", key: "PlayStation", color: customPalette[1] || "rgb(0, 48, 135)"   },
      { name: "PC",          key: "PC",          color: customPalette[2] || "rgb(2, 173, 239)"  },
    ];

    const platformTotals = {};
    platforms.forEach(p => { platformTotals[p.key] = 0; });

    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const totalHours = parseFloat(stateObj.attributes[weeklyAttr]) || 0;
      if (totalHours <= 0) continue;
      const split = stateObj.attributes.platform_split || {};
      for (const p of platforms) {
        platformTotals[p.key] += (parseFloat(split[p.key]) || 0) / 100 * totalHours;
      }
    }

    const grandTotal = platforms.reduce((s, p) => s + platformTotals[p.key], 0);
    this._renderChart(platforms, platformTotals, grandTotal);
  }

  _renderChart(platforms, platformTotals, grandTotal) {
    if (!this._contentEl) return;
    this._lastRenderArgs = [platforms, platformTotals, grandTotal];
    const VW = this._contentEl.clientWidth;
    if (!VW) {
      requestAnimationFrame(() => { if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs); });
      return;
    }

    if (grandTotal <= 0) {
      this._contentEl.innerHTML = `<div style="padding:20px;color:var(--secondary-text-color);font-style:italic;">No activity found for this period.</div>`;
      return;
    }

    const padL = 20, padR = 20;
    const barAreaW = VW - padL - padR;
    const barH = 44, padT = 8;
    const barGap = 14;
    const legendRowH = 24, totalLineH = 24, padB = 2;
    const showLegend = this.config.show_legend !== false;
    const longestPlatCh = platforms.length > 0
      ? Math.max(...platforms.map(p => p.name.length + 8))
      : 10;
    const estPlatItemW = Math.max(80, 17 + longestPlatCh * 7);
    const platLegendCols = showLegend
      ? Math.max(1, Math.min(platforms.length, 3, Math.floor(barAreaW / estPlatItemW)))
      : 1;
    const platLegendRows = showLegend ? Math.ceil(platforms.length / platLegendCols) : 0;
    const showTotal = this.config.show_total !== false && this.config.show_total !== "false";
    const totalH = padT + barH + barGap + platLegendRows * legendRowH + (showTotal ? totalLineH : 0) + padB;
    const fmt = h => h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(h * 60)}m`;

    let svg = `<svg width="${VW}" height="${totalH}" style="display:block;" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>text{font-family:var(--primary-font-family,sans-serif)}</style>`;

    // Single aggregate stacked bar
    let xCursor = padL;
    for (const p of platforms) {
      const segW = (platformTotals[p.key] / grandTotal) * barAreaW;
      if (segW < 0.5) continue;
      svg += `<rect x="${xCursor.toFixed(1)}" y="${padT}" width="${segW.toFixed(1)}" height="${barH}" fill="${p.color}" data-platform="${this._esc(p.name)}" data-hours="${platformTotals[p.key].toFixed(4)}"/>`;
      xCursor += segW;
    }

    const legY = padT + barH + barGap;
    if (showLegend) {
      const platColW = barAreaW / platLegendCols;
      platforms.forEach((p, i) => {
        const col = i % platLegendCols;
        const row = Math.floor(i / platLegendCols);
        const lx = padL + col * platColW;
        const ly = legY + row * legendRowH;
        const maxCh = Math.floor(platColW / 7) - 2;
        const fullLabel = `${p.name} (${fmt(platformTotals[p.key])})`;
        const label = fullLabel.length > maxCh ? fullLabel.slice(0, maxCh - 1) + "…" : fullLabel;
        svg += `<rect x="${lx}" y="${ly + 1}" width="12" height="12" fill="${p.color}" rx="2"/>`;
        svg += `<text x="${lx + 17}" y="${ly + 13}" font-size="14" fill="var(--primary-text-color,#ddd)">${this._esc(label)}</text>`;
      });
    }

    // Total line
    if (showTotal) {
      svg += `<text x="${(padL + barAreaW / 2).toFixed(1)}" y="${legY + platLegendRows * legendRowH + 14}" text-anchor="middle" font-size="14" fill="var(--secondary-text-color,#888)">Total: ${fmt(grandTotal)}</text>`;
    }

    svg += "</svg>";
    this._contentEl.innerHTML = svg;

    const tooltipEl = this._tooltipEl;
    const capturedGrandTotal = grandTotal;
    if (tooltipEl) {
      this._contentEl.querySelectorAll("rect[data-platform]").forEach(rect => {
        rect.addEventListener("mouseenter", () => {
          const h = parseFloat(rect.dataset.hours);
          const pct = (h / capturedGrandTotal * 100).toFixed(1);
          tooltipEl.textContent = `${rect.dataset.platform}: ${fmt(h)} (${pct}%)`;
          tooltipEl.style.display = "block";
        });
        rect.addEventListener("mousemove", ev => {
          tooltipEl.style.left = `${ev.clientX + 14}px`;
          tooltipEl.style.top = `${ev.clientY - 38}px`;
        });
        rect.addEventListener("mouseleave", () => {
          tooltipEl.style.display = "none";
        });
      });
    }
  }

  _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  getCardSize() { return 3; }
}

class GamingStatusDonutEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }

  setConfig(config) {
    this._config = { ...config };
    this.render();
  }

  set hass(hass) {
    const firstLoad = !this._hass;
    this._hass = hass;
    if (firstLoad) this.render();
  }

  render() {
    if (!this._hass || !this._config) return;

    this.shadowRoot.innerHTML = `
      <style>
        .container { display: flex; flex-direction: column; gap: 15px; color: var(--primary-text-color); }
        select, input { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; font-weight: normal; color: var(--secondary-text-color); margin-top: 2px; }
      </style>
      <div class="container">
        <label>Card Title (Optional)
          <input type="text" id="title" .configValue="title" value="${this._config.title !== undefined ? this._config.title : ""}">
        </label>
        <label>Time Window
          <select id="window" .configValue="window">
            <option value="rolling" ${this._config.window !== "calendar" ? "selected" : ""}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === "calendar" ? "selected" : ""}>Calendar (Since Sunday)</option>
          </select>
        </label>
        <label>Player Filter
          <select id="mode" .configValue="mode">
            <option value="all" ${this._config.mode === "all" || !this._config.mode ? "selected" : ""}>All Tracked Players</option>
            <option value="single" ${this._config.mode === "single" ? "selected" : ""}>Single Player</option>
            <option value="selected" ${this._config.mode === "selected" ? "selected" : ""}>Selected Players</option>
          </select>
        </label>
        <div id="single-selector" style="display: ${this._config.mode === "single" ? "block" : "none"}">
          <label>Select Player:
            <select id="single_entity" .configValue="single_entity">
              <option value="" disabled ${!this._config.single_entity ? "selected" : ""}>Select a player...</option>
              ${Object.keys(this._hass?.states || {})
                .filter(k => k.endsWith(this._config.entities_pattern || "_master") && this._hass.states[k].attributes.secondary !== undefined)
                .map(k => {
                  const name = (this._hass.states[k].attributes.friendly_name || k).replace(/ Gaming Status| Master/gi, "").trim();
                  return `<option value="${k}" ${this._config.single_entity === k ? "selected" : ""}>${name}</option>`;
                }).join("")}
            </select>
          </label>
        </div>
        <div id="selected-selector" style="display: ${this._config.mode === "selected" ? "block" : "none"}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" .configValue="selected_entities" value="${this._config.selected_entities || ""}" placeholder="sensor.gaming_status_jack_master, ...">
            <span class="helper-text">Comma-separated list of entity IDs to include in the aggregate.</span>
          </label>
        </div>
        <hr>
        <label>Custom Colors (Advanced)
          <input type="text" id="custom_colors" .configValue="custom_colors" value="${this._config.custom_colors || ""}" placeholder="rgb(11,124,16), rgb(0,48,135), rgb(2,173,239)">
          <span class="helper-text">Leave blank for default platform colors (Xbox / PlayStation / PC).</span>
        </label>
        <hr>
        <label>Legend
          <select id="show_legend" .configValue="show_legend">
            <option value="true" ${this._config.show_legend !== false && this._config.show_legend !== "false" ? "selected" : ""}>Show Legend</option>
            <option value="false" ${this._config.show_legend === false || this._config.show_legend === "false" ? "selected" : ""}>Hide Legend</option>
          </select>
          <span class="helper-text">Platform legend below the bar. Wraps to multiple rows on narrow screens.</span>
        </label>
        <label>Total
          <select id="show_total" .configValue="show_total">
            <option value="true" ${this._config.show_total !== false && this._config.show_total !== "false" ? "selected" : ""}>Show Total</option>
            <option value="false" ${this._config.show_total === false || this._config.show_total === "false" ? "selected" : ""}>Hide Total</option>
          </select>
          <span class="helper-text">Grand total playtime line below the legend.</span>
        </label>
      </div>`;

    const BOOL_FIELDS_DONUT = ["show_legend", "show_total"];
    this.shadowRoot.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("change", e => {
        const field = e.target.getAttribute(".configValue");
        const value = BOOL_FIELDS_DONUT.includes(field) ? e.target.value !== "false" : e.target.value;
        this._config = { ...this._config, [field]: value };
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
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
      color_palette: "vivid",
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
      ...config,
      color_palette: gamingStatusNormalizePalette(config),
    };
    this._lastHash = "";
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

  _getPlayHistoryBreakdown(attrs, isCalendar) {
    const playHistory = attrs.play_history || {};
    const now = new Date();
    const result = {};
    const daysBack = isCalendar ? now.getDay() : 6;
    for (let i = daysBack; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      for (const [game, seconds] of Object.entries(playHistory[key] || {})) {
        result[game] = (result[game] || 0) + (parseFloat(seconds) || 0);
      }
    }
    return result;
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

    const getBreakdown = (attrs) => isCal
      ? (attrs.calendar_weekly_breakdown || attrs.total_weekly_breakdown || attrs.weekly_breakdown || attrs.weekly_game_breakdown || {})
      : (attrs.rolling_weekly_breakdown || attrs.weekly_breakdown || attrs.weekly_game_breakdown || {});

    const getLongest = (attrs) => isCal
      ? (attrs.calendar_longest_session || attrs.total_longest_session || attrs.longest_session || "None")
      : (attrs.rolling_longest_session || attrs.longest_session || "None");

    if (this.config.metric === "game_hours") {
      let gamesMap = {};
      for (const entityId of entityIdsToProcess) {
        const stateObj = this._hass.states[entityId];
        const phBreakdown = this._getPlayHistoryBreakdown(stateObj.attributes, isCal);
        for (const [game, seconds] of Object.entries(phBreakdown)) {
          const mins = Math.floor((parseFloat(seconds) || 0) / 60);
          if (mins > 0) gamesMap[game] = (gamesMap[game] || 0) + mins;
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
          const phBreakdown = this._getPlayHistoryBreakdown(stateObj.attributes, isCal);
          const count = Object.keys(phBreakdown).length;
          finalData.push({ name: friendlyName, value: count, displayValue: `${count}` });
        }
        else if (this.config.metric === "longest") {
          const longestStr = getLongest(stateObj.attributes);
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

    const activePalette = gamingStatusResolvePalette(this.config);

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
              <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 0; transition: width 0.5s ease-out;">
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

    const colorPalette = gamingStatusNormalizePalette(this._config);

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

        <label>Card Title (Optional)
          <input type="text" id="title" .configValue="title" value="${this._config.title !== undefined ? this._config.title : ''}">
        </label>
        
        <label>Leaderboard Metric
          <select id="metric" .configValue="metric">
            <option value="hours" ${this._config.metric === 'hours' ? 'selected' : ''}>Top Players: Most Played Hours</option>
            <option value="longest" ${this._config.metric === 'longest' ? 'selected' : ''}>Top Players: Longest Gaming Session</option>
            <option value="games" ${this._config.metric === 'games' ? 'selected' : ''}>Top Players: Most Different Games Played</option>
            <option value="game_hours" ${this._config.metric === 'game_hours' ? 'selected' : ''}>Top Games: Hours Per Game (Aggregate)</option>
          </select>
        </label>

        <label>Time Window
          <select id="window" .configValue="window">
            <option value="rolling" ${this._config.window !== 'calendar' ? 'selected' : ''}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === 'calendar' ? 'selected' : ''}>Calendar (Since Sunday)</option>
          </select>
        </label>

        <label>Player Filter
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

        <label>Items to Display (Rows)
          <input type="number" id="max_players" .configValue="max_players" value="${this._config.max_players || '3'}" min="1" max="20">
        </label>
        
        <hr>

        <label>Color Palette
          <select id="color_palette" .configValue="color_palette">${gamingStatusPaletteOptionsHTML(colorPalette)}</select>
          <span class="helper-text">Colors are assigned to rows in order and cycle if there are more entries than colors.</span>
        </label>

        <div id="custom-colors-selector" style="display: ${colorPalette === 'custom' ? 'block' : 'none'}">
          <label>Custom Colors (Advanced)
            <input type="text" id="custom_colors" .configValue="custom_colors" value="${this._config.custom_colors || ''}" placeholder="#ffbe0b, #fb5607, ...">
            <span class="helper-text">Comma-separated colors. A 10-color palette is recommended so colors don't repeat.</span>
          </label>
        </div>
      </div>
    `;

    const singleSelector = this.shadowRoot.getElementById('single-selector');
    const selectedSelector = this.shadowRoot.getElementById('selected-selector');
    const customColorsSelector = this.shadowRoot.getElementById('custom-colors-selector');

    this.shadowRoot.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', e => {
        const field = e.target.getAttribute('.configValue');
        const value = e.target.value;

        this._config = { ...this._config, [field]: value };

        if (field === 'mode') {
            singleSelector.style.display = (value === 'single') ? 'block' : 'none';
            selectedSelector.style.display = (value === 'selected') ? 'block' : 'none';
        }

        if (field === 'color_palette') {
            customColorsSelector.style.display = (value === 'custom') ? 'block' : 'none';
        }

        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
    });
  }
}

// ====================================================================
// CARD 6: GAMING STATUS - WEEKLY GAMES
// ====================================================================

class GamingStatusGameChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-game-chart-editor");
  }

  static getStubConfig() {
    return { title: "", mode: "all", entity: "", selected_entities: "", window: "rolling", max_games: 6, color_palette: "vivid", custom_colors: "", entities_pattern: "_master" };
  }

  setConfig(config) {
    // Backward compat: entity set without mode → single player
    const mode = config.mode || (config.entity ? "single" : "all");
    this.config = {
      ...config,
      title: config.title || "",
      mode,
      entity: config.entity || "",
      selected_entities: config.selected_entities || "",
      entities_pattern: config.entities_pattern || "_master",
      window: config.window || "rolling",
      max_games: parseInt(config.max_games) || 6,
      color_palette: gamingStatusNormalizePalette(config),
      custom_colors: config.custom_colors || "",
    };
    this._lastHash = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let entityIds = [];
    if (this.config.mode === "single" && this.config.entity) {
      if (hass.states[this.config.entity]) entityIds.push(this.config.entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIds = this.config.selected_entities.split(",").map(e => e.trim()).filter(e => hass.states[e]);
    } else {
      for (const key in hass.states) {
        if ((key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) &&
            key.endsWith(this.config.entities_pattern) &&
            hass.states[key].attributes.secondary !== undefined) {
          entityIds.push(key);
        }
      }
    }
    entityIds.sort();

    if (!entityIds.length) return;

    const hash = entityIds.map(id => `${id}:${hass.states[id]?.last_updated}`).join(",")
      + "|" + this.config.window + "|" + this.config.max_games + "|" + this.config.color_palette + "|" + this.config.custom_colors;
    if (this._lastHash === hash) return;
    this._lastHash = hash;
    this._update(entityIds);
  }

  _ensureShell() {
    if (!this.shadowRoot.querySelector("ha-card")) {
      this.shadowRoot.innerHTML = `
        <ha-card style="padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e));">
          <div id="gc-title" style="font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none;"></div>
          <div id="gc-content"></div>
        </ha-card>
        <div id="gc-tooltip" style="position:fixed;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:5px 9px;border-radius:5px;font-size:12px;white-space:nowrap;display:none;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`;
      this._titleEl = this.shadowRoot.getElementById("gc-title");
      this._contentEl = this.shadowRoot.getElementById("gc-content");
      this._tooltipEl = this.shadowRoot.getElementById("gc-tooltip");
      if (!this._ro && typeof ResizeObserver !== "undefined") {
        let rafId;
        this._ro = new ResizeObserver(() => {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs);
          });
        });
        this._ro.observe(this._contentEl);
      }
    }
    if (this._titleEl) {
      this._titleEl.textContent = this.config.title || "";
      this._titleEl.style.display = this.config.title ? "block" : "none";
    }
  }

  _update(entityIds) {
    this._ensureShell();
    const now = new Date();
    const days = [];

    if (this.config.window === "calendar") {
      const dayOfWeek = now.getDay();
      for (let i = dayOfWeek; i >= 0; i--) {
        days.push(this._fmtDate(new Date(now.getTime() - i * 86400000)));
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        days.push(this._fmtDate(new Date(now.getTime() - i * 86400000)));
      }
    }

    // Aggregate play_history (seconds → hours) across all entities
    const aggregated = {};
    for (const entityId of entityIds) {
      const playHistory = this._hass.states[entityId]?.attributes?.play_history || {};
      for (const day of days) {
        for (const [game, seconds] of Object.entries(playHistory[day] || {})) {
          const hours = (parseFloat(seconds) || 0) / 3600;
          if (hours > 0) {
            if (!aggregated[day]) aggregated[day] = {};
            aggregated[day][game] = (aggregated[day][game] || 0) + hours;
          }
        }
      }
    }

    const dailyData = days.map(day => ({ day, games: aggregated[day] || {} }));

    const totals = {};
    for (const d of dailyData) {
      for (const [g, h] of Object.entries(d.games)) {
        totals[g] = (totals[g] || 0) + h;
      }
    }
    const topGames = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.max_games)
      .map(([g]) => g);

    this._renderChart(dailyData, topGames);
  }

  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  _renderChart(dailyData, games) {
    if (!this._contentEl) return;
    this._lastRenderArgs = [dailyData, games];
    const VW = this._contentEl.clientWidth;
    if (!VW) {
      requestAnimationFrame(() => { if (this._lastRenderArgs) this._renderChart(...this._lastRenderArgs); });
      return;
    }

    if (!games.length || dailyData.every(d => !Object.keys(d.games).length)) {
      this._contentEl.innerHTML = `<div style="padding:20px;color:var(--secondary-text-color);font-style:italic;">No game activity found for this period.</div>`;
      return;
    }

    const palette = gamingStatusResolvePalette(this.config);
    const colorOf = (i) => palette[i % palette.length];

    // SVG layout
    const padL = 42, padR = 12, padT = 8, padB = 50, areaH = 220;
    const areaW = VW - padL - padR;

    const showLegend = this.config.show_legend !== false;
    const legendRowH = 22;
    const longestCh = games.length > 0 ? Math.max(...games.map(g => g.length)) : 10;
    const estItemW = Math.max(80, 17 + longestCh * 7);
    const legendCols = showLegend
      ? Math.max(1, Math.min(games.length, 3, Math.floor(areaW / estItemW)))
      : 1;
    const legendRows = showLegend ? Math.ceil(games.length / legendCols) : 0;
    const legendH = showLegend ? legendRows * legendRowH + 12 : 0;
    const totalH = padT + areaH + padB + legendH;

    // Y scale
    const maxDaily = Math.max(
      ...dailyData.map(d => games.reduce((s, g) => s + (d.games[g] || 0), 0)),
      0.25
    );
    const niceMax = this._niceMax(maxDaily);
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => +(f * niceMax).toFixed(4));

    const n = dailyData.length || 1;
    const slotW = areaW / n;
    const barW = slotW * 0.65;
    const barOff = (slotW - barW) / 2;
    const fy = (h) => padT + areaH - (h / niceMax) * areaH;

    let svg = `<svg width="${VW}" height="${totalH}" style="display:block;" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<style>text{font-family:var(--primary-font-family,sans-serif)}</style>`;

    // Y-axis grid lines and labels
    for (const tick of yTicks) {
      const y = fy(tick).toFixed(1);
      svg += `<line x1="${padL}" y1="${y}" x2="${VW - padR}" y2="${y}" stroke="rgba(128,128,128,0.15)" stroke-width="1"/>`;
      const label = tick === 0 ? "0" : tick >= 1 ? `${Math.round(tick)}h` : `${Math.round(tick * 60)}m`;
      svg += `<text x="${padL - 5}" y="${(+y + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--primary-text-color,#ddd)">${label}</text>`;
    }

    // X-axis baseline
    svg += `<line x1="${padL}" y1="${(padT + areaH).toFixed(1)}" x2="${VW - padR}" y2="${(padT + areaH).toFixed(1)}" stroke="rgba(128,128,128,0.3)" stroke-width="1"/>`;

    // Stacked bars and X-axis date labels
    dailyData.forEach((d, i) => {
      const slotX = padL + i * slotW;
      const bx = (slotX + barOff).toFixed(1);
      const bw = barW.toFixed(1);
      let yBase = padT + areaH;

      // Draw bottom-to-top (games[0] ends up at the bottom of the stack)
      for (let gi = games.length - 1; gi >= 0; gi--) {
        const h = d.games[games[gi]] || 0;
        if (h <= 0) continue;
        const bh = (h / niceMax) * areaH;
        svg += `<rect x="${bx}" y="${(yBase - bh).toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" fill="${colorOf(gi)}" data-game="${this._esc(games[gi])}" data-hours="${h.toFixed(4)}" style="transition:opacity 0.2s ease"/>`;
        yBase -= bh;
      }

      const dt = new Date(d.day + "T12:00:00");
      const cx = (slotX + slotW / 2).toFixed(1);
      svg += `<text x="${cx}" y="${(padT + areaH + 16).toFixed(1)}" text-anchor="middle" font-size="13" fill="var(--primary-text-color,#ddd)">${dt.toLocaleDateString(undefined, { weekday: "short" })}</text>`;
      svg += `<text x="${cx}" y="${(padT + areaH + 30).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--primary-text-color,#ddd)">${dt.getMonth() + 1}/${dt.getDate()}</text>`;
    });

    // Legend
    const legY0 = padT + areaH + padB + 2;
    if (showLegend) {
      const colW = areaW / legendCols;
      games.forEach((g, i) => {
        const col = i % legendCols;
        const row = Math.floor(i / legendCols);
        const lx = padL + col * colW;
        const ly = legY0 + row * legendRowH;
        svg += `<rect x="${lx}" y="${ly}" width="12" height="12" fill="${colorOf(i)}" rx="2" style="transition:opacity 0.2s ease" data-swatch-game="${this._esc(g)}"/>`;
        const maxCh = Math.floor(colW / 7) - 2;
        const name = g.length > maxCh ? g.slice(0, maxCh - 1) + "…" : g;
        svg += `<text x="${lx + 17}" y="${ly + 11}" font-size="14" fill="var(--primary-text-color,#ddd)">${this._esc(name)}</text>`;
        svg += `<rect x="${lx}" y="${ly - 2}" width="${colW - 4}" height="${legendRowH}" fill="transparent" style="cursor:pointer" data-legend-game="${this._esc(g)}"/>`;
      });
    }

    svg += "</svg>";
    this._contentEl.innerHTML = svg;

    const tooltipEl = this._tooltipEl;
    if (tooltipEl) {
      this._contentEl.querySelectorAll("rect[data-game]").forEach(rect => {
        rect.addEventListener("mouseenter", () => {
          const totalMins = Math.round(parseFloat(rect.dataset.hours) * 60);
          const h = Math.floor(totalMins / 60);
          const m = totalMins % 60;
          const display = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
          tooltipEl.textContent = `${rect.dataset.game}: ${display}`;
          tooltipEl.style.display = "block";
        });
        rect.addEventListener("mousemove", (ev) => {
          tooltipEl.style.left = `${ev.clientX + 14}px`;
          tooltipEl.style.top = `${ev.clientY - 38}px`;
        });
        rect.addEventListener("mouseleave", () => {
          tooltipEl.style.display = "none";
        });
      });
    }

    let focusedGame = null;
    const applyGameFocus = (name) => {
      this._contentEl.querySelectorAll("rect[data-game]").forEach(r => {
        r.style.opacity = r.dataset.game === name ? "1" : "0.15";
      });
      this._contentEl.querySelectorAll("rect[data-swatch-game]").forEach(r => {
        r.style.opacity = r.dataset.swatchGame === name ? "1" : "0.15";
      });
    };
    const clearGameFocus = () => {
      this._contentEl.querySelectorAll("rect[data-game], rect[data-swatch-game]").forEach(r => {
        r.style.opacity = "1";
      });
    };
    this._contentEl.querySelectorAll("rect[data-legend-game]").forEach(hitRect => {
      const gameName = hitRect.dataset.legendGame;
      hitRect.addEventListener("click", () => {
        if (focusedGame === gameName) {
          focusedGame = null;
          clearGameFocus();
        } else {
          focusedGame = gameName;
          applyGameFocus(gameName);
        }
      });
      hitRect.addEventListener("mouseenter", () => {
        if (focusedGame) return;
        applyGameFocus(gameName);
      });
      hitRect.addEventListener("mouseleave", () => {
        if (focusedGame) return;
        clearGameFocus();
      });
    });
  }

  _niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(c => c >= v) || v * 1.25;
  }

  _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  getCardSize() { return 5; }
}

class GamingStatusGameChartEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }

  setConfig(config) { this._config = config; this.render(); }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.render();
  }

  render() {
    if (!this._hass || !this._config) return;

    const targetSuffix = this._config.entities_pattern || "_master";
    const entityOptions = Object.keys(this._hass.states)
      .filter(k => k.endsWith(targetSuffix) && this._hass.states[k].attributes.secondary !== undefined)
      .map(k => {
        const name = (this._hass.states[k].attributes.friendly_name || k).replace(/ Gaming Status| Master/gi, "").trim();
        return `<option value="${k}" ${this._config.entity === k ? "selected" : ""}>${this._esc(name)}</option>`;
      }).join("");

    const mode = this._config.mode || (this._config.entity ? "single" : "all");
    const colorPalette = gamingStatusNormalizePalette(this._config);

    this.shadowRoot.innerHTML = `
      <style>
        .container { display: flex; flex-direction: column; gap: 15px; color: var(--primary-text-color); }
        select, input { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        select:focus, input:focus { outline: none; border-color: var(--primary-color); }
        label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; font-weight: normal; color: var(--secondary-text-color); margin-top: 2px; }
      </style>
      <div class="container">
        <label>Card Title (Optional)
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </label>
        <label>Player Filter
          <select id="mode">
            <option value="all" ${mode === "all" ? "selected" : ""}>All Tracked Players</option>
            <option value="single" ${mode === "single" ? "selected" : ""}>Single Player</option>
            <option value="selected" ${mode === "selected" ? "selected" : ""}>Selected Players</option>
          </select>
        </label>
        <div id="single-selector" style="display: ${mode === "single" ? "block" : "none"}">
          <label>Select Player:
            <select id="entity">
              <option value="" disabled ${!this._config.entity ? "selected" : ""}>Select a player…</option>
              ${entityOptions}
            </select>
          </label>
        </div>
        <div id="selected-selector" style="display: ${mode === "selected" ? "block" : "none"}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="sensor.gaming_status_jack_master, ...">
            <span class="helper-text">Comma-separated entity IDs. Game hours are aggregated across all selected players.</span>
          </label>
        </div>
        <label>Time Window
          <select id="window">
            <option value="rolling" ${this._config.window !== "calendar" ? "selected" : ""}>Rolling (Past 7 Days)</option>
            <option value="calendar" ${this._config.window === "calendar" ? "selected" : ""}>Calendar (Since Sunday)</option>
          </select>
        </label>
        <label>Max Games to Display
          <input type="number" id="max_games" value="${parseInt(this._config.max_games) || 6}" min="1" max="20">
          <span class="helper-text">Ranks by total hours across all selected players and shows the top N. Default: 6.</span>
        </label>
        <hr>
        <label>Color Palette
          <select id="color_palette">${gamingStatusPaletteOptionsHTML(colorPalette)}</select>
          <span class="helper-text">Colors are assigned to games in order and cycle if there are more games than colors.</span>
        </label>
        ${colorPalette === "custom" ? `
        <label>Custom Colors (Advanced)
          <input type="text" id="custom_colors" value="${this._esc(this._config.custom_colors || "")}" placeholder="#3a86ff, #ffbe0b, …">
          <span class="helper-text">Comma-separated colors. A 10-color palette is recommended so colors don't repeat.</span>
        </label>` : ""}
        <hr>
        <label>Legend
          <select id="show_legend">
            <option value="true" ${this._config.show_legend !== false && this._config.show_legend !== "false" ? "selected" : ""}>Show Legend</option>
            <option value="false" ${this._config.show_legend === false || this._config.show_legend === "false" ? "selected" : ""}>Hide Legend</option>
          </select>
          <span class="helper-text">Hide the game title legend to give more vertical space to the chart.</span>
        </label>
      </div>`;

    const BOOL_FIELDS_GAME = ["show_legend"];
    ["title", "mode", "entity", "selected_entities", "window", "max_games", "color_palette", "custom_colors", "show_legend"].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.addEventListener("change", ev => {
        const value = BOOL_FIELDS_GAME.includes(id) ? ev.target.value !== "false" : ev.target.value;
        this._config = { ...this._config, [id]: value };
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
        this.render();
      });
    });
  }

  _esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
}

// ====================================================================
// CARD 7: GAMING STATUS - RECENT SESSIONS
// ====================================================================

class GamingStatusRecentSessionsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-recent-sessions-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      max_sessions: 10,
      background: "art",
      show_column_player: true,
      show_column_game: true,
      show_column_platform: true,
      show_column_duration: true,
      show_column_date: true,
      show_column_time: true,
      entities_pattern: "_master",
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      title: config.title || "",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || "",
      max_sessions: config.max_sessions !== undefined ? parseInt(config.max_sessions) || 10 : 10,
      background: config.background || "art",
      show_column_player: config.show_column_player !== false,
      show_column_game: config.show_column_game !== false,
      show_column_platform: config.show_column_platform !== false,
      show_column_duration: config.show_column_duration !== false,
      show_column_date: config.show_column_date !== false,
      show_column_time: config.show_column_time !== false,
      entities_pattern: config.entities_pattern || "_master",
    };
    this._lastHash = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    let entityIds = [];
    if (this.config.mode === "single" && this.config.single_entity) {
      if (hass.states[this.config.single_entity]) entityIds.push(this.config.single_entity);
    } else if (this.config.mode === "selected" && this.config.selected_entities) {
      entityIds = this.config.selected_entities.split(",").map(e => e.trim()).filter(e => hass.states[e]);
    } else {
      entityIds = Object.keys(hass.states).filter(
        k => (k.startsWith("sensor.gaming_status_") || k.startsWith("binary_sensor.gaming_status_")) &&
             k.endsWith(this.config.entities_pattern) &&
             hass.states[k].attributes.secondary !== undefined
      );
    }
    entityIds.sort();

    const hash = entityIds.map(id => {
      const sessions = hass.states[id]?.attributes?.recent_sessions || [];
      return `${id}:${sessions.length}:${sessions[0] ? sessions[0].start_time : ""}`;
    }).join(",")
      + "|" + this.config.max_sessions
      + "|" + this.config.background
      + "|" + [this.config.show_column_player, this.config.show_column_game, this.config.show_column_platform, this.config.show_column_duration, this.config.show_column_date, this.config.show_column_time].join(",");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(this.processData(entityIds));
  }

  processData(entityIds) {
    let rows = [];
    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const playerName = (stateObj.attributes.friendly_name || entityId).replace(/ Gaming Status| Master/gi, "").trim();
      const avatar = stateObj.attributes.entity_picture || "";
      const sessions = stateObj.attributes.recent_sessions || [];

      for (const s of sessions) {
        rows.push({
          player: playerName,
          avatar,
          game: s.game || "Unknown",
          platform: s.platform || "",
          duration_seconds: parseInt(s.duration_seconds) || 0,
          date: s.date || "",
          start_time: s.start_time || "",
          hero_art_url: s.hero_art_url || "",
        });
      }
    }

    rows.sort((a, b) => (Date.parse(b.start_time) || 0) - (Date.parse(a.start_time) || 0));

    const limit = Math.max(1, parseInt(this.config.max_sessions) || 10);
    return rows.slice(0, limit);
  }

  _getVisibleColumns() {
    const isSingle = this.config.mode === "single";
    const ALL_COLUMNS = [
      { key: "player", label: "Player", flex: "1.2" },
      { key: "game", label: "Game", flex: "2" },
      { key: "platform", label: "Platform", flex: "1" },
      { key: "duration", label: "Duration", flex: "0.9" },
      { key: "date", label: "Date", flex: "0.9" },
      { key: "time", label: "Time", flex: "0.9" },
    ];
    return ALL_COLUMNS.filter(c => {
      if (c.key === "player") return !isSingle && this.config.show_column_player;
      return this.config[`show_column_${c.key}`];
    });
  }

  _formatDuration(seconds) {
    const totalMins = Math.round(seconds / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  _formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  _formatTime(startTime) {
    if (!startTime) return "";
    const d = new Date(startTime);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  render(rows) {
    const escapeHTML = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #rs-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }

          .rs-header-row { display: flex; align-items: center; gap: 8px; padding: 0 10px 8px 10px; box-sizing: border-box; }
          .rs-header-cell { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

          .rs-body { display: flex; flex-direction: column; gap: 6px; }
          .rs-body.scrollable { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          .rs-body::-webkit-scrollbar { width: 6px; }
          .rs-body::-webkit-scrollbar-track { background: transparent; }
          .rs-body::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.4); border-radius: 3px; }
          .rs-body::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.8); }

          .rs-row {
            position: relative; overflow: hidden; border-radius: 8px; display: flex; align-items: center; gap: 8px;
            padding: 9px 10px; box-sizing: border-box; flex-shrink: 0;
          }
          .rs-row.no-bg { background: var(--secondary-background-color, rgba(120, 120, 120, 0.08)); }
          .rs-row.has-bg::before {
            content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; z-index: 0; pointer-events: none;
            background-size: cover; background-position: center;
            background-image: linear-gradient(to right, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.75) 100%), var(--rs-bg-url);
            filter: blur(6px);
          }

          .rs-cell { position: relative; z-index: 1; font-size: 13px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .rs-cell.primary { font-weight: 600; }
          .rs-row.has-bg .rs-cell { color: #ffffff; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); }

          .rs-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="rs-title"></div>
          <div id="rs-header" class="rs-header-row"></div>
          <div id="rs-body" class="rs-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("rs-title");
      this._headerEl = this.shadowRoot.getElementById("rs-header");
      this._bodyEl = this.shadowRoot.getElementById("rs-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    const columns = this._getVisibleColumns();
    this._headerEl.innerHTML = columns.map(c => `<div class="rs-header-cell" style="flex: ${c.flex};">${c.label}</div>`).join("");

    // Match the List card's "scrollable" pattern: once more than 10 rows would
    // be shown, cap the visible height to roughly 10 rows and scroll instead
    // of letting the card grow unbounded.
    if (rows.length > 10) {
      const rowH = 40, gap = 6;
      this._bodyEl.style.maxHeight = `${(rowH * 10) + (gap * 9)}px`;
      this._bodyEl.classList.add("scrollable");
    } else {
      this._bodyEl.style.maxHeight = "";
      this._bodyEl.classList.remove("scrollable");
    }

    if (!rows.length) {
      this._bodyEl.innerHTML = `<div class="rs-empty">No recent sessions found.</div>`;
      return;
    }

    this._bodyEl.innerHTML = rows.map(row => {
      let bgUrl = "";
      if (this.config.background === "avatar") bgUrl = row.avatar;
      else if (this.config.background !== "none") bgUrl = row.hero_art_url || "";
      const hasBg = !!bgUrl;

      const cellsHTML = columns.map(c => {
        let value = "";
        let cls = "rs-cell";
        switch (c.key) {
          case "player": value = escapeHTML(row.player); cls += " primary"; break;
          case "game": value = escapeHTML(row.game); cls += " primary"; break;
          case "platform": value = escapeHTML(row.platform); break;
          case "duration": value = escapeHTML(this._formatDuration(row.duration_seconds)); break;
          case "date": value = escapeHTML(this._formatDate(row.date)); break;
          case "time": value = escapeHTML(this._formatTime(row.start_time)); break;
        }
        return `<div class="${cls}" style="flex: ${c.flex};">${value}</div>`;
      }).join("");

      return `<div class="rs-row ${hasBg ? "has-bg" : "no-bg"}" style="${hasBg ? `--rs-bg-url: url('${bgUrl}');` : ""}">${cellsHTML}</div>`;
    }).join("");
  }

  getCardSize() {
    return 4;
  }
}

class GamingStatusRecentSessionsEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this.render();
  }

  render() {
    if (!this._config) return;
    const mode = this._config.mode || "all";
    const targetSuffix = this._config.entities_pattern || "_master";
    const entityOptions = this._hass ? Object.keys(this._hass.states)
      .filter(k => k.endsWith(targetSuffix) && this._hass.states[k].attributes.secondary !== undefined)
      .map(k => {
        const name = (this._hass.states[k].attributes.friendly_name || k).replace(/ Gaming Status| Master/gi, "").trim();
        return `<option value="${k}" ${this._config.single_entity === k ? "selected" : ""}>${this._esc(name)}</option>`;
      }).join("") : "";

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], input[type="number"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
        .radio-group, .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Player Filter</div>
          <select id="mode">
            <option value="all" ${mode === "all" ? "selected" : ""}>All Tracked Players</option>
            <option value="single" ${mode === "single" ? "selected" : ""}>Single Player</option>
            <option value="selected" ${mode === "selected" ? "selected" : ""}>Selected Players</option>
          </select>
        </div>
        ${mode === "single" ? `
        <div>
          <div class="section-title">Select Player</div>
          <select id="single_entity">
            <option value="" disabled ${!this._config.single_entity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>` : ""}
        ${mode === "selected" ? `
        <div>
          <div class="section-title">Selected Entities</div>
          <div class="helper-text">Comma-separated entity IDs to include.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="sensor.gaming_status_jack_master, ...">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Number of Sessions to Display</div>
          <div class="helper-text">Shows the most recently completed sessions, newest first. If more than 10 would be shown, the list scrolls instead of growing taller.</div>
          <input type="number" id="max_sessions" value="${parseInt(this._config.max_sessions) || 10}" min="1" max="20">
        </div>
        <hr>
        <div>
          <div class="section-title">Background</div>
          <div class="radio-group">
            <label><input type="radio" name="background" data-field="background" value="art" ${this._config.background !== "avatar" && this._config.background !== "none" ? "checked" : ""}> Game Artwork</label>
            <label><input type="radio" name="background" data-field="background" value="avatar" ${this._config.background === "avatar" ? "checked" : ""}> Player Avatar</label>
            <label><input type="radio" name="background" data-field="background" value="none" ${this._config.background === "none" ? "checked" : ""}> None</label>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Visible Columns</div>
          <div class="checkbox-group">
            ${mode !== "single" ? `<label><input type="checkbox" data-field="show_column_player" ${this._config.show_column_player !== false ? "checked" : ""}> Player</label>` : ""}
            <label><input type="checkbox" data-field="show_column_game" ${this._config.show_column_game !== false ? "checked" : ""}> Game</label>
            <label><input type="checkbox" data-field="show_column_platform" ${this._config.show_column_platform !== false ? "checked" : ""}> Platform</label>
            <label><input type="checkbox" data-field="show_column_duration" ${this._config.show_column_duration !== false ? "checked" : ""}> Duration</label>
            <label><input type="checkbox" data-field="show_column_date" ${this._config.show_column_date !== false ? "checked" : ""}> Date</label>
            <label><input type="checkbox" data-field="show_column_time" ${this._config.show_column_time !== false ? "checked" : ""}> Time</label>
          </div>
        </div>
      </div>
    `;

    const fireChanged = () => {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    };

    this.shadowRoot.getElementById("title").addEventListener("change", (ev) => {
      this._config = { ...this._config, title: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("mode").addEventListener("change", (ev) => {
      this._config = { ...this._config, mode: ev.target.value };
      fireChanged();
      this.render();
    });

    const singleEntity = this.shadowRoot.getElementById("single_entity");
    if (singleEntity) {
      singleEntity.addEventListener("change", (ev) => {
        this._config = { ...this._config, single_entity: ev.target.value };
        fireChanged();
      });
    }

    const selectedEntities = this.shadowRoot.getElementById("selected_entities");
    if (selectedEntities) {
      selectedEntities.addEventListener("change", (ev) => {
        this._config = { ...this._config, selected_entities: ev.target.value };
        fireChanged();
      });
    }

    this.shadowRoot.getElementById("max_sessions").addEventListener("change", (ev) => {
      this._config = { ...this._config, max_sessions: parseInt(ev.target.value) || 10 };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="background"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, background: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        this._config = { ...this._config, [ev.target.dataset.field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

// Card 6
customElements.define("gaming-status-game-chart-card", GamingStatusGameChartCard);
customElements.define("gaming-status-game-chart-editor", GamingStatusGameChartEditor);

// Card 7
customElements.define("gaming-status-recent-sessions-card", GamingStatusRecentSessionsCard);
customElements.define("gaming-status-recent-sessions-editor", GamingStatusRecentSessionsEditor);

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
  name: "Gaming Status - Weekly Hours",
  preview: true,
  description:
    "A stacked bar chart showing daily gaming hours per player across your household.",
});

window.customCards.push({
  type: "gaming-status-donut-card",
  name: "Gaming Status - Platforms",
  preview: true,
  description: "Aggregate platform split bar chart (Xbox / PlayStation / PC) across all players."
});

window.customCards.push({
  type: "gaming-status-leaderboard-card",
  name: "Gaming Status - Leaderboard",
  preview: true,
  description: "A dynamic standalone bar graph ranking the top players across chosen metrics."
});

window.customCards.push({
  type: "gaming-status-game-chart-card",
  name: "Gaming Status - Weekly Games",
  preview: true,
  description: "A per-player stacked bar chart showing daily hours broken down by game."
});

window.customCards.push({
  type: "gaming-status-recent-sessions-card",
  name: "Gaming Status - Recent Sessions",
  preview: true,
  description: "A configurable table of recently completed play sessions with optional blurred artwork backgrounds."
});