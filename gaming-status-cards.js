// ====================================================================
// ====================================================================
// CARD 1: GAMING STATUS - LIST
// ====================================================================
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
      title: "",
      mode: "all",
      sort_by: "last_online",
      show_badges: true,
      show_text_shadow: true,
      max_visible_players: "",
      manual_entities: "",
    };
  }

  setConfig(config) {
    if (!config.entities_pattern) {
      config = { ...config, entities_pattern: "_gaming_status" };
    }
    this.config = {
      title: config.title || "",
      mode: config.mode || "all",
      sort_by: config.sort_by || "last_online",
      show_badges: config.show_badges !== false,
      show_text_shadow: config.show_text_shadow !== false,
      max_visible_players: config.max_visible_players || "",
      manual_entities: config.manual_entities || "",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;

    let targetSuffix = "_gaming_status";
    if (["steam", "xbox", "playstation"].includes(this.config.mode)) {
      targetSuffix = `_${this.config.mode}`;
    }

    // --- PERFORMANCE OPTIMIZATION: FAST HASH ---
    let currentHash = "";
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
          currentHash += hass.states[id].state + hass.states[id].last_updated;
        }
      }
    } else {
      // Fast loop over keys instead of Object.values
      for (const entityId in hass.states) {
        if (entityId.startsWith("sensor.") && entityId.includes(targetSuffix)) {
          rawEntities.push(hass.states[entityId]);
          currentHash +=
            hass.states[entityId].state + hass.states[entityId].last_updated;
        }
      }
    }

    // Instantly kill the function if our specific entities haven't changed
    if (this._lastHash === currentHash) return;
    this._lastHash = currentHash;
    // -------------------------------------------

    const processedData = this.processData(rawEntities);
    this.render(processedData);
  }

  processData(entities) {
    let filtered = entities.filter((entity) => {
      const state = entity.state.toLowerCase();
      const isOffline = ["offline", "unavailable", "unknown"].includes(state);
      if (this.config.mode === "online" && isOffline) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const stateA = a.state.toLowerCase();
      const stateB = b.state.toLowerCase();
      const isOfflineA = ["offline", "unavailable", "unknown"].includes(stateA);
      const isOfflineB = ["offline", "unavailable", "unknown"].includes(stateB);

      if (isOfflineA !== isOfflineB) return isOfflineA ? 1 : -1;
      if (this.config.sort_by === "name") {
        const nameA = a.attributes.friendly_name || a.entity_id;
        const nameB = b.attributes.friendly_name || b.entity_id;
        return nameA.localeCompare(nameB);
      }
      if (this.config.sort_by === "state") return stateA.localeCompare(stateB);

      const getValidTime = (entity) => {
        const isCurrentlyOffline = ["offline", "unavailable", "unknown"].includes(entity.state.toLowerCase());

        if (!isCurrentlyOffline && entity.attributes.play_start_time) {
          return new Date(entity.attributes.play_start_time).getTime();
        }

        if (entity.attributes.last_online_valid_timestamp) {
          return new Date(entity.attributes.last_online_valid_timestamp).getTime();
        }
        
        if (isCurrentlyOffline) return 0;
        return new Date(entity.last_changed).getTime();
      };

      const timeA = getValidTime(a);
      const timeB = getValidTime(b);
      return timeB - timeA;
    });

    return filtered.map((entity) => {
      const platform = (
        entity.attributes.active_platform || this.config.mode
      ).toLowerCase();
      let badgeIcon = "mdi:gamepad-variant";
      let platformColor = "100, 50, 100";
      if (platform.includes("steam")) {
        badgeIcon = "mdi:steam";
        platformColor = "2, 173, 239";
      } else if (platform.includes("xbox")) {
        badgeIcon = "mdi:microsoft-xbox";
        platformColor = "11, 124, 16";
      } else if (platform.includes("playstation")) {
        badgeIcon = "mdi:sony-playstation";
        platformColor = "0, 48, 135";
      }

      const isOffline = ["offline", "unavailable", "unknown"].includes(
        entity.state.toLowerCase()
      );
      const friendlyName = (
        entity.attributes.friendly_name || entity.entity_id
      ).replace(/ Gaming Status| Steam| Xbox| PlayStation/gi, "");

      return {
        entity_id: entity.entity_id,
        name: friendlyName,
        state: entity.state,
        secondary: entity.attributes.secondary || "",
        picture: entity.attributes.entity_picture || "",
        cover:
          entity.attributes.game_cover_art ||
          entity.attributes.entity_picture ||
          "",
        platformColor,
        badgeIcon,
        isOffline,
      };
    });
  }

  render(data) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .card-header {
            font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px;
            color: var(--ha-card-header-color, var(--primary-text-color)); padding: 8px 16px 16px;
            display: ${this.config.title ? "block" : "none"};
          }
          .card-stack { display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box; }
          .card-stack.scrollable { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          
          /* Custom Scrollbar */
          .card-stack::-webkit-scrollbar { width: 6px; }
          .card-stack::-webkit-scrollbar-track { background: transparent; }
          .card-stack::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.4); border-radius: 3px; }
          .card-stack::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.8); }

          .player-card {
            position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px);
            background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
            display: flex; align-items: center; padding: 10px 10px; cursor: pointer; box-sizing: border-box;
            width: 100%; transition: transform 0.2s;
            flex-shrink: 0; /* Prevents flexbox from squishing the cards */
          }
          .player-card:active { transform: scale(0.98); }
          .player-card::before { content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; background-size: cover; background-position: center; z-index: 0; pointer-events: none; }
          
          .player-card.online { border-right: 8px solid rgb(var(--platform-color-raw)); }
          .player-card.offline { border-right: none; }
          .player-card.default-tint::before { background-image: linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%), var(--bg-url); }
          .player-card.default-tint.online::before { filter: blur(5px) brightness(0.7); }
          .player-card.default-tint.offline::before { filter: blur(5px) grayscale(100%) brightness(0.5); }
          .player-card.platform-tint::before { background-image: linear-gradient(to right, rgb(var(--platform-color-raw)) 0%, rgba(0, 0, 0, 0.5) 100%), var(--bg-url); filter: blur(5px); }

          .content-wrapper { position: relative; z-index: 1; display: flex; align-items: center; width: 100%; gap: 12px; pointer-events: none; }
          .avatar-container { position: relative; width: 36px; height: 36px; flex-shrink: 0; }
          .avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
          .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; background: rgb(var(--platform-color-raw)); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; }
          .player-card.default-tint.offline .badge { background: grey; }
          .badge ha-icon { --mdc-icon-size: 12px; margin-top: -1px; color: white; }

          .text-content { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
          .primary { font-weight: 600; font-size: 14px; color: white; text-shadow: ${
            this.config.show_text_shadow
              ? "1px 1px 2px rgba(0,0,0,0.8)"
              : "none"
          }; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 2px; }
          .secondary { font-size: 12px; color: #ffffff; text-shadow: ${
            this.config.show_text_shadow
              ? "1px 1px 2px rgba(0,0,0,0.8)"
              : "none"
          }; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
          
          .placeholder-avatar { background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
        </style>
        <div class="card-header">${this.config.title}</div>
        <div id="players-container" class="card-stack"></div>
      `;
      this.content = this.shadowRoot.getElementById("players-container");
    }

    // Always re-apply scroll constraints (works on first render and config changes)
    if (this.config.max_visible_players && parseInt(this.config.max_visible_players) > 0) {
      const maxPlayers = parseInt(this.config.max_visible_players);
      // Each card: 36px avatar + 20px padding = 56px, plus 8px gap between cards
      const maxHeight = (56 * maxPlayers) + (8 * (maxPlayers - 1));
      this.content.style.maxHeight = `${maxHeight}px`;
      this.content.classList.add("scrollable");
    } else {
      this.content.style.maxHeight = "";
      this.content.classList.remove("scrollable");
    }

    if (data.length === 0) {
      this.content.innerHTML = `
        <div class="player-card offline default-tint" style="--bg-url: none; --platform-color-raw: 128, 128, 128; cursor: default;" data-entity-id="">
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
        const isPlatformMode = ["steam", "xbox", "playstation"].includes(
          this.config.mode
        );
        const tintClass = isPlatformMode ? "platform-tint" : "default-tint";
        const statusClass = player.isOffline ? "offline" : "online";
        return `
        <div class="player-card ${statusClass} ${tintClass}" style="--bg-url: url('${
          player.cover || "/static/icons/favicon-192x192.png"
        }'); --platform-color-raw: ${player.platformColor};" data-entity-id="${
          player.entity_id
        }">
          <div class="content-wrapper">
            <div class="avatar-container">
              <img class="avatar" src="${
                player.picture || "/static/icons/favicon-192x192.png"
              }" />
              ${
                this.config.show_badges
                  ? `<div class="badge"><ha-icon icon="${player.badgeIcon}"></ha-icon></div>`
                  : ""
              }
            </div>
            <div class="text-content">
              <div class="primary">${player.name}</div>
              <div class="secondary">${
                player.state !== "Offline" ? player.state + " " : ""
              }${player.secondary}</div>
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
        <div><div class="section-title">Card Title</div><input type="text" id="title-input" .configValue="title" value="${
          this._config.title || ""
        }"></div><hr>
        <div><div class="section-title">Mode</div><div class="radio-group">
            <label><input type="radio" name="mode" .configValue="mode" value="all" ${
              this._config.mode === "all" || !this._config.mode ? "checked" : ""
            }> All Players</label>
            <label><input type="radio" name="mode" .configValue="mode" value="online" ${
              this._config.mode === "online" ? "checked" : ""
            }> Online Only</label>
            <label><input type="radio" name="mode" .configValue="mode" value="steam" ${
              this._config.mode === "steam" ? "checked" : ""
            }> Steam</label>
            <label><input type="radio" name="mode" .configValue="mode" value="xbox" ${
              this._config.mode === "xbox" ? "checked" : ""
            }> Xbox</label>
            <label><input type="radio" name="mode" .configValue="mode" value="playstation" ${
              this._config.mode === "playstation" ? "checked" : ""
            }> PlayStation</label>
        </div></div><hr>
        <div><div class="section-title">Sort By</div><div class="radio-group">
            <label><input type="radio" name="sort" .configValue="sort_by" value="last_online" ${
              this._config.sort_by === "last_online" || !this._config.sort_by
                ? "checked"
                : ""
            }> Last Online</label>
            <label><input type="radio" name="sort" .configValue="sort_by" value="name" ${
              this._config.sort_by === "name" ? "checked" : ""
            }> Name</label>
            <label><input type="radio" name="sort" .configValue="sort_by" value="state" ${
              this._config.sort_by === "state" ? "checked" : ""
            }> Game Title</label>
        </div></div><hr>
        <div><div class="section-title">Visibility Options</div>
          <label><input type="checkbox" .configValue="show_badges" ${
            this._config.show_badges !== false ? "checked" : ""
          }> Show Platform Badges</label>
          <label style="margin-top: 10px;"><input type="checkbox" .configValue="show_text_shadow" ${
            this._config.show_text_shadow !== false ? "checked" : ""
          }> Show Text Shadow</label>
        </div><hr>
        <div>
          <div class="section-title">Maximum Visible Players</div>
          <div class="helper-text">Leave blank to show all players. Enter a number to restrict the visible height and enable a dynamic scrollbar.</div>
          <input type="number" id="max-players-input" .configValue="max_visible_players" value="${
            this._config.max_visible_players || ""
          }" placeholder="e.g. 3" min="1">
        </div><hr>
        <div>
          <div class="section-title">Manual Entities (Advanced)</div>
          <div class="helper-text">Leave blank to automatically grab all sensors. To restrict this card to specific people, enter a comma-separated list of exact entity IDs (e.g. <code>sensor.adam_gaming_status, sensor.liv_gaming_status</code>).</div>
          <input type="text" id="manual-entities-input" .configValue="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="sensor.adam_gaming_status, ...">
        </div>
      </div>
    `;

    const titleInput = this.shadowRoot.getElementById("title-input");
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

    const maxPlayersInput = this.shadowRoot.getElementById("max-players-input");
    maxPlayersInput.addEventListener("change", (ev) => {
      this._config = { ...this._config, max_visible_players: ev.target.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    });

    const manualInput = this.shadowRoot.getElementById("manual-entities-input");
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
      .querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach((input) => {
        input.addEventListener("change", (ev) => {
          if (!this._config) return;
          const target = ev.target;
          let value =
            target.type === "checkbox" ? target.checked : target.value;
          this._config = {
            ...this._config,
            [target.getAttribute(".configValue")]: value,
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
// ====================================================================
// CARD 2: GAMING STATUS - SLIDESHOW
// ====================================================================
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
      aspect_ratio: "3840/1240",
      time_per_slide: 5,
      transition_time: 1,
      show_avatars: true,
      auto_hide: true,
      include_plex: false,
      manual_entities: "",
      entities_pattern: "_gaming_status",
    };
  }

  setConfig(config) {
    this.config = {
      aspect_ratio: config.aspect_ratio || "3840/1240",
      time_per_slide:
        config.time_per_slide !== undefined ? config.time_per_slide : 5,
      transition_time:
        config.transition_time !== undefined ? config.transition_time : 1,
      show_avatars: config.show_avatars !== false,
      auto_hide: config.auto_hide !== false,
      include_plex: config.include_plex === true,
      manual_entities: config.manual_entities || "",
      entities_pattern: config.entities_pattern || "_gaming_status",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;

    // --- PERFORMANCE OPTIMIZATION: FAST HASH ---
    let currentHash = "";
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
          currentHash += hass.states[id].state + hass.states[id].last_updated;
        }
      }
    } else {
      for (const entityId in hass.states) {
        if (
          entityId.startsWith("sensor.") &&
          entityId.includes(this.config.entities_pattern)
        ) {
          rawEntities.push(hass.states[entityId]);
          currentHash +=
            hass.states[entityId].state + hass.states[entityId].last_updated;
        }
      }
    }

    // Add Plex/Tautulli sensors to the processing pool if enabled
    if (this.config.include_plex) {
      for (const entityId in hass.states) {
        if (
          entityId.startsWith("sensor.plex_session_") &&
          entityId.includes("_tautulli")
        ) {
          // Prevent duplicates if user manually specified them
          if (!rawEntities.some((e) => e.entity_id === entityId)) {
            rawEntities.push(hass.states[entityId]);
            currentHash +=
              hass.states[entityId].state + hass.states[entityId].last_updated;
          }
        }
      }
    }

    if (this._lastHash === currentHash) return;
    this._lastHash = currentHash;
    // -------------------------------------------

    const processedData = this.processData(rawEntities);

    this.render(processedData);
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
        const isOffline = ["offline", "unavailable", "unknown", "idle"].includes(
          state
        );
        const isHistory = state.includes("last seen") || state.includes("ago");

        if (!isOffline && !isHistory) {
          const gameName = entity.attributes.current_game;
          const gameArt = entity.attributes.game_cover_art;
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
              width: 100%; aspect-ratio: ${this.config.aspect_ratio}; border-radius: var(--ha-card-border-radius, 12px); 
              position: relative; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0px 5px 15px rgba(0,0,0,0.5));
              background: var(--card-background-color, #1e1e1e);
            "></ha-card>`;
          this.content = this.shadowRoot.getElementById("slideshow-container");
        }
        this.content.style.aspectRatio = this.config.aspect_ratio;
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
          width: 100%; aspect-ratio: ${this.config.aspect_ratio}; border-radius: var(--ha-card-border-radius, 12px); 
          position: relative; overflow: hidden; box-shadow: var(--ha-card-box-shadow, 0px 5px 15px rgba(0,0,0,0.5));
          background: #000;
        "></ha-card>`;
      this.content = this.shadowRoot.getElementById("slideshow-container");
    }
    this.content.style.aspectRatio = this.config.aspect_ratio;

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
        <div style="width: 100%; height: 100%; background-image: url('${
          data[0].art
        }'); background-size: cover; background-position: center;"></div>
        ${getAvatarHtml(data[0].players)}
      `;
      return;
    }

    const t_slide = parseFloat(this.config.time_per_slide);
    const t_trans = parseFloat(this.config.transition_time);
    const loop_duration = data.length * t_slide;
    const pct_fade = (t_trans / loop_duration) * 100;
    const pct_visible = ((t_slide - t_trans) / loop_duration) * 100;
    const item_ids = data
      .map((g) => g.name.replace(/[^a-zA-Z0-9]/g, ""))
      .join("");
    const anim_name = `anim_${item_ids}`;

    let html = `<style>
      @keyframes ${anim_name} {
        0% { opacity: 0; }
        ${pct_fade}% { opacity: 1; }
        ${pct_fade + pct_visible}% { opacity: 1; }
        ${pct_fade + pct_visible + pct_fade}% { opacity: 0; }
        100% { opacity: 0; }
      }
    </style>`;

    data.forEach((g, index) => {
      const delay = index * t_slide;
      html += `
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; animation: ${anim_name} ${loop_duration}s infinite; animation-delay: ${delay}s;">
          <div style="width: 100%; height: 100%; background-image: url('${
            g.art
          }'); background-size: cover; background-position: center;"></div>
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
        input[type="text"], input[type="number"] { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus { outline: none; border-color: var(--primary-color); }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
      </style>
      <div class="editor-container">
        <div><div class="section-title">Aspect Ratio</div><input type="text" id="aspect-input" .configValue="aspect_ratio" value="${
          this._config.aspect_ratio || "3840/1240"
        }" placeholder="e.g. 3840/1240 or 16/9"></div>
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
          }" placeholder="sensor.adam_gaming_status, ...">
        </div>
      </div>
    `;

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
// ====================================================================
// CARD 3: GAMING STATUS - CHART (ApexCharts Wrapper)
// ====================================================================
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
      entities_pattern: "_gaming_status",
    };
  }

  setConfig(config) {
    this.config = {
      title: config.title || "",
      manual_entities: config.manual_entities || "",
      custom_colors: config.custom_colors || "",
      entities_pattern: config.entities_pattern || "_gaming_status",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;

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
          key.startsWith("sensor.") &&
          key.includes(this.config.entities_pattern)
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
      ).replace(/ Gaming Status/gi, "");
      const assignedColor = activePalette[index % activePalette.length];

      dynamicSeries.push({
        entity: entityId,
        attribute: "rolling_weekly_hours",
        name: friendlyName,
        color: assignedColor,
        show: { in_header: true, in_chart: false },
      });

      dynamicSeries.push({
        entity: entityId,
        attribute: "total_daily_hours",
        name: friendlyName,
        type: "column",
        color: assignedColor,
        show: { in_header: false, in_chart: true },
        group_by: { func: "last", duration: "1d", fill: "zero" },
      });
    });

    const apexConfig = {
      type: "custom:apexcharts-card",
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
          }" placeholder="sensor.adam_gaming_status, ...">
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
// ====================================================================
// REGISTRATION (Registers ALL THREE cards to Home Assistant)
// ====================================================================
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