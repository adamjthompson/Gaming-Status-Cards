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

// Start-of-window timestamp (ms) for the selected reporting window.
// Rolling = past 7 days (today + 6 prior days); Calendar = since the most recent
// Sunday. Uses local-midnight day boundaries to stay consistent with the
// play_history day windowing used elsewhere in these cards.
function gamingStatusWindowStart(isCalendar, now) {
  const ref = now || new Date();
  const startOfToday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const daysBack = isCalendar ? ref.getDay() : 6;
  return startOfToday.getTime() - daysBack * 86400000;
}

// Buckets a session's platform string into the three groups the Platforms card
// charts. Anything that isn't Xbox or PlayStation (Steam, Playnite, Discord,
// Custom, bare PC, …) rolls up into PC, matching the integration's own split.
function gamingStatusPlatformBucket(platform) {
  const p = String(platform || "").toLowerCase();
  if (p.includes("xbox")) return "Xbox";
  if (p.includes("playstation") || p.includes("ps4") || p.includes("ps5")) return "PlayStation";
  return "PC";
}

function gamingStatusPaletteOptionsHTML(selected) {
  const presetOpts = Object.entries(GAMING_STATUS_PALETTES)
    .map(([key, p]) => `<option value="${key}" ${selected === key ? "selected" : ""}>${p.label}</option>`)
    .join("");
  return `${presetOpts}<option value="custom" ${selected === "custom" ? "selected" : ""}>Custom Colors</option>`;
}

// ====================================================================
// SHARED: GENERAL-PURPOSE HELPERS
// ====================================================================

const GAMING_STATUS_DEFAULT_ENTITIES_PATTERN = "_master";

// Strips the trailing "Gaming Status"/"Master"/platform-name suffixes HA
// tacks onto a gaming_status entity's friendly_name, leaving just the
// player's name (e.g. "Adam Gaming Status Master" -> "Adam"). Includes the
// platform words (Steam/Xbox/...) too, not just "Master", so this stays
// correct for any entities_pattern, not only the default "_master" suffix.
function gamingStatusCleanPlayerName(rawName) {
  return String(rawName).replace(/ Gaming Status| Master| Chart| Steam| Xbox| PlayStation| PC| Custom| Discord| Playnite/gi, "").trim();
}

function gamingStatusEscapeHTML(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ====================================================================
// SHARED: PLAYER ENTITY DROPDOWNS (Single Player mode)
// ====================================================================

// Returns [{id, name}] of gaming_status player entities matching the given
// suffix, sorted alphabetically by display name so "first in the list" is
// deterministic and matches what the dropdown actually shows.
function gamingStatusGetPlayerEntities(hass, targetSuffix) {
  if (!hass) return [];
  return Object.keys(hass.states)
    .filter(k => k.endsWith(targetSuffix) && hass.states[k].attributes.secondary !== undefined)
    .map(k => ({
      id: k,
      name: gamingStatusCleanPlayerName(hass.states[k].attributes.friendly_name || k),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Resolves a "Selected Entities" config string into real entity IDs. Each
// comma-separated token can be either a full entity_id (kept as-is, so
// existing configs pasted before this helper existed keep working
// unchanged) or a bare player name like "adam" (matched case-insensitively
// against gamingStatusGetPlayerEntities' cleaned display names for the
// given suffix). Tokens that match neither are silently dropped, same as
// the previous "only accept entity IDs that actually exist" behavior.
function gamingStatusResolveSelectedEntities(hass, rawText, targetSuffix) {
  if (!hass || !rawText) return [];
  const playerEntities = gamingStatusGetPlayerEntities(hass, targetSuffix || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
  const idByLowerName = new Map(playerEntities.map(e => [e.name.toLowerCase(), e.id]));
  const result = [];
  for (const token of rawText.split(',').map(t => t.trim()).filter(Boolean)) {
    if (hass.states[token]) {
      result.push(token);
    } else {
      const matchedId = idByLowerName.get(token.toLowerCase());
      if (matchedId) result.push(matchedId);
    }
  }
  return result;
}

// Resolves the exact entity IDs a single/all/selected mode config should
// process. Single source of truth for GamingStatusLeaderboardCard, which
// previously had this "all" mode filter implemented twice (once in set
// hass() to compute its change-hash, once in updateLeaderboard() to build
// the actual displayed data) with two different, inconsistent domain/prefix
// checks -- so the hash could in theory diverge from what actually renders.
function gamingStatusLeaderboardEntityIds(hass, config) {
  if (config.mode === "single" && config.single_entity) {
    return hass.states[config.single_entity] ? [config.single_entity] : [];
  }
  if (config.mode === "selected" && config.selected_entities) {
    return gamingStatusResolveSelectedEntities(hass, config.selected_entities, config.entities_pattern);
  }
  const targetSuffix = config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
  const result = [];
  for (const key in hass.states) {
    if ((key.startsWith("sensor.gaming_status_") || key.startsWith("binary_sensor.gaming_status_")) && key.endsWith(targetSuffix) && hass.states[key].attributes.secondary !== undefined) {
      result.push(key);
    }
  }
  return result;
}

function gamingStatusPlayerOptionsHTML(entities, selected, escapeFn) {
  const esc = escapeFn || ((s) => s);
  return entities.map(e => `<option value="${e.id}" ${selected === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("");
}

// If "Single Player" mode has no selection yet, defaults to the first
// available player (alphabetically) instead of leaving the dropdown on the
// dead-end "Select a player…" placeholder. Mutates `config` in place and
// returns true if a default was just applied, so the caller can persist it.
function gamingStatusDefaultSingleEntity(config, entities, field) {
  const key = field || "single_entity";
  if (config.mode === "single" && !config[key] && entities.length) {
    config[key] = entities[0].id;
    return true;
  }
  return false;
}

// For always-single-player cards/editors (Game Management, PlayStation
// Trophies, 100% Completion, Near Completion, Stats, Library): there's a
// window where gamingStatusDefaultSingleEntity's mutation hasn't actually
// been persisted back through Home Assistant's own editor lifecycle yet
// (e.g. the very first render, before `hass` -- and therefore the real
// player list -- is available at all), during which the CARD itself
// already falls back to the first available player for actually fetching
// data (see each card's own _resolveTarget*/_resolveTargetEntityId), but
// the EDITOR's dropdown would still show the dead-end "Select a player…"
// placeholder since config[key] is still genuinely empty. This computes
// the same effective fallback purely for display, independent of whether
// persistence has caught up yet, so the dropdown never contradicts what
// the card is actually showing.
function gamingStatusEffectiveSingleEntity(config, entities, field) {
  const key = field || "single_entity";
  if (config[key] && entities.some(e => e.id === config[key])) return config[key];
  return entities.length ? entities[0].id : "";
}

// ====================================================================
// SHARED: SVG CHART RENDERING (Weekly Hours / Platforms / Weekly Games)
// ====================================================================

// Returns a stable "re-render from last known args" callback for a chart
// card, used both by its ResizeObserver and its zero-width retry guard so
// every chart card wires the exact same recovery behavior.
function gamingStatusRerenderer(card) {
  return () => { if (card._lastRenderArgs) card._renderChart(...card._lastRenderArgs); };
}

// Creates (and starts observing) a debounced ResizeObserver that re-renders
// via requestAnimationFrame on resize. Returns null (instead of throwing)
// on runtimes without ResizeObserver. Callers are responsible for only
// calling this once per card instance (typically guarded by `if (!this._ro)`
// in _ensureShell()), since observing the same element twice would double
// up the resize callback.
function gamingStatusWireResize(contentEl, rerender) {
  if (typeof ResizeObserver === "undefined") return null;
  let rafId;
  const ro = new ResizeObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(rerender);
  });
  ro.observe(contentEl);
  return ro;
}

// Returns contentEl's current width, or schedules a rAF retry (via
// `rerender`) and returns 0 if the container hasn't been laid out yet (e.g.
// a card added to a not-yet-visible tab). Callers should bail out of
// rendering whenever this returns a falsy value.
function gamingStatusChartWidth(contentEl, rerender) {
  const VW = contentEl.clientWidth;
  if (!VW) requestAnimationFrame(rerender);
  return VW;
}

// Shared "did the relevant entities actually change" hash fragment used by
// the Weekly Hours/Platforms/Weekly Games cards' set hass(). Callers append
// their own config-specific fields (window, palette, custom colors, etc.)
// since those legitimately differ per card.
function gamingStatusEntityHash(hass, entityIds) {
  return entityIds.map(id => `${id}:${hass.states[id]?.last_updated}`).join(",");
}

// Wires a floating tooltip to every element matching `selector` inside
// contentEl. `formatText(rect)` returns the tooltip's text for that
// element; cursor-following position math is identical across every chart
// card, so only the text formatting varies per caller.
function gamingStatusWireTooltip(contentEl, tooltipEl, selector, formatText) {
  if (!tooltipEl) return;
  contentEl.querySelectorAll(selector).forEach(rect => {
    rect.addEventListener("mouseenter", () => {
      tooltipEl.textContent = formatText(rect);
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

// Same cursor-following wiring as gamingStatusWireTooltip, but for content
// that needs more than one line (e.g. player/platform/game/achievement/date
// all at once) -- formatHTML(el) returns pre-escaped HTML rather than plain
// text. Kept separate from gamingStatusWireTooltip (rather than adding an
// options param to it) since every existing caller is single-line/nowrap and
// has no reason to change.
function gamingStatusWireHtmlTooltip(contentEl, tooltipEl, selector, formatHTML) {
  if (!tooltipEl) return;
  contentEl.querySelectorAll(selector).forEach(el => {
    el.addEventListener("mouseenter", () => {
      tooltipEl.innerHTML = formatHTML(el);
      tooltipEl.style.display = "block";
    });
    el.addEventListener("mousemove", (ev) => {
      tooltipEl.style.left = `${ev.clientX + 14}px`;
      tooltipEl.style.top = `${ev.clientY - 38}px`;
    });
    el.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });
  });
}

// Wires click-to-pin / hover-to-preview "focus" behavior between a chart's
// bars and its legend swatches: hovering (or clicking to pin) a legend
// entry dims every other bar/swatch so the selected one stands out.
// `dataKey` is the dataset property shared by the main bars
// (`data-<dataKey>`), their legend swatches (`data-swatch-<dataKey>`), and
// the legend hit-targets (`data-legend-<dataKey>`) -- e.g. "player" or
// "game". Not every chart card wants this (the Platforms donut doesn't),
// so it's opt-in per card rather than folded into gamingStatusWireTooltip.
function gamingStatusWireLegendFocus(contentEl, dataKey) {
  const cap = dataKey[0].toUpperCase() + dataKey.slice(1);
  const swatchKey = "swatch" + cap;
  const legendKey = "legend" + cap;
  let focused = null;
  const applyFocus = (name) => {
    contentEl.querySelectorAll(`rect[data-${dataKey}]`).forEach(r => {
      r.style.opacity = r.dataset[dataKey] === name ? "1" : "0.15";
    });
    contentEl.querySelectorAll(`rect[data-swatch-${dataKey}]`).forEach(r => {
      r.style.opacity = r.dataset[swatchKey] === name ? "1" : "0.15";
    });
  };
  const clearFocus = () => {
    contentEl.querySelectorAll(`rect[data-${dataKey}], rect[data-swatch-${dataKey}]`).forEach(r => {
      r.style.opacity = "1";
    });
  };
  contentEl.querySelectorAll(`rect[data-legend-${dataKey}]`).forEach(hitRect => {
    const name = hitRect.dataset[legendKey];
    hitRect.addEventListener("click", () => {
      if (focused === name) { focused = null; clearFocus(); }
      else { focused = name; applyFocus(name); }
    });
    hitRect.addEventListener("mouseenter", () => { if (!focused) applyFocus(name); });
    hitRect.addEventListener("mouseleave", () => { if (!focused) clearFocus(); });
  });
}

// Same platform brand colors used by the List card's "Platform Native" color mode.
const GAMING_STATUS_PLATFORM_TINTS = {
  steam: "2, 173, 239",
  xbox: "11, 124, 16",
  playstation: "0, 48, 135",
  playnite: "255, 88, 51",
  custom: "100, 50, 100",
  discord: "88, 101, 242",
};

const GAMING_STATUS_PLATFORM_LABELS = {
  steam: "Steam",
  xbox: "Xbox",
  playstation: "PlayStation",
  playnite: "Playnite",
  custom: "Custom",
  discord: "Discord",
};

// Returns the Set of platform keys that currently have at least one real
// gaming_status entity, so editors can hide platform-specific options that
// would otherwise always be dead/empty. Returns null when hass isn't
// available yet - callers must treat null as "show everything" (fail open).
function gamingStatusGetAvailablePlatforms(hass) {
  if (!hass) return null;
  const keys = Object.keys(hass.states);
  const available = new Set();
  Object.keys(GAMING_STATUS_PLATFORM_LABELS).forEach(platform => {
    const suffix = `_${platform}`;
    const hasEntity = keys.some(k =>
      k.startsWith("sensor.gaming_status_") &&
      k.endsWith(suffix) &&
      hass.states[k].attributes.secondary !== undefined
    );
    if (hasEntity) available.add(platform);
  });
  return available;
}

// Global integration setting (Global Settings > Enable Game Color
// Extraction), exposed on every gaming_status entity's attributes. Used to
// hide "dynamic game color" options entirely when the backend never
// populates game_dominant_color at all. Fails open (true) until we find an
// entity that actually reports the attribute, matching this file's existing
// convention of not hiding options before hass data has loaded.
function gamingStatusIsColorExtractionEnabled(hass) {
  if (!hass) return true;
  for (const key of Object.keys(hass.states)) {
    if (!key.startsWith("sensor.gaming_status_")) continue;
    const attrs = hass.states[key].attributes;
    if (attrs && attrs.color_extraction_enabled !== undefined) {
      return attrs.color_extraction_enabled !== false;
    }
  }
  return true;
}

// Same pattern as gamingStatusIsColorExtractionEnabled, for the global
// "Enable Achievement/Trophy Tracking" setting -- used by the Recent
// Achievements card to show a friendly "not enabled" empty state instead
// of a permanently-empty table when no player has this turned on. Fails
// open (true) until hass data has actually loaded, same reasoning as
// above: don't flash the "disabled" message before we've had a chance to
// check the real value.
function gamingStatusIsAchievementTrackingEnabled(hass) {
  if (!hass) return true;
  for (const key of Object.keys(hass.states)) {
    if (!key.startsWith("sensor.gaming_status_")) continue;
    const attrs = hass.states[key].attributes;
    if (attrs && attrs.achievement_tracking_enabled !== undefined) {
      return attrs.achievement_tracking_enabled !== false;
    }
  }
  return true;
}

// Joins display labels the way natural English lists read: "A", "A & B",
// "A, B, & C". Used to build the "PC" mode option's label dynamically from
// whichever of its constituent platforms actually have entities.
function gamingStatusJoinLabels(labels) {
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return labels.join(" & ");
  return `${labels.slice(0, -1).join(", ")}, & ${labels[labels.length - 1]}`;
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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

    let targetSuffix = GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    if (["steam", "xbox", "playstation", "pc", "custom", "discord", "playnite"].includes(this.config.mode)) {
      targetSuffix = `_${this.config.mode}`;
    }

    let currentHash = "";
    let rawEntities = [];

    if (this.config.manual_entities && this.config.manual_entities.trim() !== "") {
      const entityIds = gamingStatusResolveSelectedEntities(hass, this.config.manual_entities, targetSuffix);
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
    const colorExtractionEnabled = gamingStatusIsColorExtractionEnabled(this._hass);
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
      
      const useGameColor = colorExtractionEnabled && this.config.color_mode !== "platform";
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

      const friendlyName = gamingStatusCleanPlayerName(entity.attributes.friendly_name || entity.entity_id)

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
    const escapeHTML = gamingStatusEscapeHTML;

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

const GAMING_STATUS_MODE_OPTIONS = [
  { value: "all", label: "All Players" },
  { value: "online", label: "Online Only" },
  { value: "steam", label: "Steam", platforms: ["steam"] },
  { value: "xbox", label: "Xbox", platforms: ["xbox"] },
  { value: "playstation", label: "PlayStation", platforms: ["playstation"] },
  { value: "pc", label: "PC (Steam, Discord, Playnite, & Custom)", platforms: ["steam", "discord", "playnite", "custom"] },
  { value: "discord", label: "Discord", platforms: ["discord"] },
  { value: "playnite", label: "Playnite", platforms: ["playnite"] },
  { value: "custom", label: "Custom", platforms: ["custom"] },
];

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
    const first = !this._hass;
    this._hass = hass;
    if (first) this.render();
  }
  render() {
    if (!this._config) return;

    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const colorExtractionEnabled = gamingStatusIsColorExtractionEnabled(this._hass);
    const modeOptions = GAMING_STATUS_MODE_OPTIONS
      .filter(opt => !opt.platforms || !availablePlatforms || opt.platforms.some(p => availablePlatforms.has(p)))
      .map(opt => {
        if (opt.value !== "pc" || !availablePlatforms) return opt;
        const activeLabels = opt.platforms.filter(p => availablePlatforms.has(p)).map(p => GAMING_STATUS_PLATFORM_LABELS[p]);
        return { ...opt, label: `PC (${gamingStatusJoinLabels(activeLabels)})` };
      });

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
            ${modeOptions.map(opt => `<label><input type="radio" name="mode" data-field="mode" value="${opt.value}" ${
              this._config.mode === opt.value || (opt.value === "all" && !this._config.mode) ? "checked" : ""
            }> ${opt.label}</label>`).join("")}
        </div></div><hr>
        ${colorExtractionEnabled ? `
        <div><div class="section-title">Color Mode</div><div class="radio-group">
            <label><input type="radio" name="color_mode" data-field="color_mode" value="game" ${
              this._config.color_mode !== "platform" ? "checked" : ""
            }> Game Artwork (Dynamic)</label>
            <label><input type="radio" name="color_mode" data-field="color_mode" value="platform" ${
              this._config.color_mode === "platform" ? "checked" : ""
            }> Platform Native (Pre-Defined)</label>
        </div></div><hr>` : ""}
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
          <div class="helper-text">Leave blank to automatically grab all sensors. To restrict this card to specific people, enter a comma-separated list of player names (e.g. <code>adam, josh, liv</code>) or full entity IDs.</div>
          <input type="text" id="manual-entities-input" data-field="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="adam, josh, liv">
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
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
      ...config,
      // Logo/Icon are no longer offered as options on this card -- their
      // transparent backgrounds can look broken crossfading over whatever
      // the previous/next slide's own background is. Re-clamped here
      // (after the ...config spread above, which would otherwise let a
      // previously-saved logo/icon value silently keep being used) rather
      // than removed from the option list alone.
      artwork_type: ["logo", "icon"].includes(config.artwork_type) ? "hero" : (config.artwork_type || "hero"),
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
      const entityIds = gamingStatusResolveSelectedEntities(hass, this.config.manual_entities, this.config.entities_pattern);
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
          </select>
          <div class="helper-text">Logo and Icon aren't offered here -- their transparent backgrounds can look broken crossfading over whatever's behind them.</div>
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
          <div class="helper-text">Leave blank to automatically grab all sensors, or restrict by entering comma-separated player names (e.g. adam, josh, liv) or full entity IDs.</div>
          <input type="text" id="manual-entities-input-slide" .configValue="manual_entities" value="${
            this._config.manual_entities || ""
          }" placeholder="adam, josh, liv">
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
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
    } else {
      entityIds = Object.keys(hass.states).filter(
        k => (k.startsWith("sensor.gaming_status_") || k.startsWith("binary_sensor.gaming_status_")) &&
             k.endsWith(this.config.entities_pattern) &&
             hass.states[k].attributes.secondary !== undefined
      );
    }
    entityIds.sort();

    const hash = gamingStatusEntityHash(hass, entityIds)
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
      if (!this._ro) {
        this._ro = gamingStatusWireResize(this._contentEl, gamingStatusRerenderer(this));
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
      const name = gamingStatusCleanPlayerName(stateObj.attributes.friendly_name || entityId);
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
    const VW = gamingStatusChartWidth(this._contentEl, gamingStatusRerenderer(this));
    if (!VW) return;

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

    gamingStatusWireTooltip(this._contentEl, this._tooltipEl, "rect[data-player]", (rect) => {
      const totalMins = Math.round(parseFloat(rect.dataset.hours) * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const display = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      return isSingle ? display : `${rect.dataset.player}: ${display}`;
    });
    gamingStatusWireLegendFocus(this._contentEl, "player");
  }

  _niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(c => c >= v) || v * 1.25;
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
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
    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity, (s) => this._esc(s));

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
          <div class="helper-text">Comma-separated player names (or full entity IDs) to include in the chart.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="adam, josh, liv">
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

  _esc(s) { return gamingStatusEscapeHTML(s); }
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
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
    } else {
      const manualStr = this.config.manual_entities || "";
      if (manualStr) {
        entityIds = gamingStatusResolveSelectedEntities(hass, manualStr, this.config.entities_pattern);
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

    const hash = gamingStatusEntityHash(hass, entityIds)
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
      if (!this._ro) {
        this._ro = gamingStatusWireResize(this._contentEl, gamingStatusRerenderer(this));
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
    const windowStart = gamingStatusWindowStart(isCal);
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
      const attrs = stateObj.attributes;
      const sessions = attrs.recent_sessions;

      if (Array.isArray(sessions)) {
        // Derive per-platform hours from the session log, filtered to the selected
        // window. The platform_split attribute is scoped to the calendar week, so a
        // fresh week wiped out the chart even under Rolling (past 7 days); computing
        // from windowed sessions keeps Rolling populated across week boundaries.
        for (const s of sessions) {
          const ts = Date.parse(s.start_time || s.date || "");
          if (isNaN(ts) || ts < windowStart) continue;
          const hours = (parseInt(s.duration_seconds) || 0) / 3600;
          if (hours <= 0) continue;
          platformTotals[gamingStatusPlatformBucket(s.platform)] += hours;
        }
      } else {
        // Fallback for entities without a session log: split the weekly total.
        const totalHours = parseFloat(attrs[weeklyAttr]) || 0;
        if (totalHours <= 0) continue;
        const split = attrs.platform_split || {};
        for (const p of platforms) {
          platformTotals[p.key] += (parseFloat(split[p.key]) || 0) / 100 * totalHours;
        }
      }
    }

    const grandTotal = platforms.reduce((s, p) => s + platformTotals[p.key], 0);
    this._renderChart(platforms, platformTotals, grandTotal);
  }

  _renderChart(platforms, platformTotals, grandTotal) {
    if (!this._contentEl) return;
    this._lastRenderArgs = [platforms, platformTotals, grandTotal];
    const VW = gamingStatusChartWidth(this._contentEl, gamingStatusRerenderer(this));
    if (!VW) return;

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

    gamingStatusWireTooltip(this._contentEl, this._tooltipEl, "rect[data-platform]", (rect) => {
      const h = parseFloat(rect.dataset.hours);
      const pct = (h / grandTotal * 100).toFixed(1);
      return `${rect.dataset.platform}: ${fmt(h)} (${pct}%)`;
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
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

    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }

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
          <label>Select Player
            <select id="single_entity" .configValue="single_entity">
              <option value="" disabled ${!this._config.single_entity ? "selected" : ""}>Select a player...</option>
              ${gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity)}
            </select>
          </label>
        </div>
        <div id="selected-selector" style="display: ${this._config.mode === "selected" ? "block" : "none"}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" .configValue="selected_entities" value="${this._config.selected_entities || ""}" placeholder="adam, josh, liv">
            <span class="helper-text">Comma-separated player names (or full entity IDs) to include in the aggregate.</span>
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
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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

    let entityIdsToProcess = gamingStatusLeaderboardEntityIds(hass, this.config);

    let currentHash = "";
    for (const id of entityIdsToProcess) {
      currentHash += hass.states[id].state + hass.states[id].last_updated;
    }
    if (this.config.metric === "steam_total_playtime") {
      // This metric's actual data lives on DIFFERENT entities
      // (sensor..._library_steam per resolved player) than whatever
      // entityIdsToProcess resolved above (each player's real-time
      // _master sensor) -- fold each one's last_updated in too, or a
      // Full Game Library Scan rescan for any resolved player wouldn't
      // otherwise trigger a re-render.
      for (const libId of this._steamLibraryEntityIdsFor(entityIdsToProcess)) {
        currentHash += "|steam_lib:" + hass.states[libId].last_updated;
      }
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

  // Longest single session within the selected window, computed from the session
  // log. Returns { mins, game } for the longest session, or null when the entity
  // has no session log, so callers can fall back to the pre-aggregated
  // longest_session attributes.
  _windowLongestMinutes(attrs, windowStart) {
    const sessions = attrs.recent_sessions;
    if (!Array.isArray(sessions)) return null;
    let maxSecs = 0;
    let game = "";
    for (const s of sessions) {
      const ts = Date.parse(s.start_time || s.date || "");
      if (isNaN(ts) || ts < windowStart) continue;
      const secs = parseInt(s.duration_seconds) || 0;
      if (secs > maxSecs) {
        maxSecs = secs;
        game = s.game || "";
      }
    }
    return { mins: Math.floor(maxSecs / 60), game };
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

  // Maps a list of resolved player _master entity ids (whatever mode --
  // all/single/selected -- gamingStatusLeaderboardEntityIds already
  // produced) to their sensor.gaming_status_<owner>_library_steam
  // counterparts, same suffix-replace technique GamingStatusStatsCard.
  // _resolveTargetEntityId uses. A player without Full Game Library Scan
  // enabled for Steam simply has no such entity and is filtered out here
  // -- not an error, just no contribution from that player.
  _steamLibraryEntityIdsFor(masterEntityIds) {
    return masterEntityIds
      .map(id => id.replace(/_master$/, "_library_steam"))
      .filter(id => this._hass.states[id]);
  }

  // "Steam Games: Total Playtime" -- a per-game breakdown of lifetime
  // Steam playtime (Steam's own playtime_forever, captured as
  // playtime_hours per game by the Full Game Library Scan), summed across
  // every resolved player the same way game_hours/all_time_top_games
  // already aggregate their own per-game data -- a game more than one
  // selected player has played combines into one total bar. Kept as its
  // own method (not threaded through updateLeaderboard's shared
  // entityIdsToProcess loop body) since the data source and per-entity
  // resolution are genuinely different here.
  _renderSteamTotalPlaytime(masterEntityIds) {
    const escapeHTML = gamingStatusEscapeHTML;
    const libraryEntityIds = this._steamLibraryEntityIdsFor(masterEntityIds);

    let gamesMap = {};
    for (const libId of libraryEntityIds) {
      const games = this._hass.states[libId].attributes.games || [];
      for (const g of games) {
        if ((g.platform || "").toLowerCase() !== "steam") continue;
        const hours = g.playtime_hours || 0;
        const title = g.title || "Unknown";
        if (hours > 0) gamesMap[title] = (gamesMap[title] || 0) + hours;
      }
    }

    const limit = parseInt(this.config.max_players) || 3;
    const finalData = Object.entries(gamesMap)
      .map(([name, value]) => ({ name, value, displayValue: `${Math.round(value * 10) / 10}h` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    if (!finalData.length) {
      this.content.innerHTML = `<div style="padding: 10px; color: var(--secondary-text-color); font-style: italic;">No playtime totals available.</div>`;
      return;
    }

    const activePalette = gamingStatusResolvePalette(this.config);
    const maxValue = Math.max(...finalData.map(d => d.value));
    let html = `<div style="display: flex; flex-direction: column; gap: 14px; margin-top: 8px;">`;
    finalData.forEach((item, index) => {
      const color = activePalette[index % activePalette.length];
      const safeName = escapeHTML(item.name);
      const safeDisplay = escapeHTML(item.displayValue);
      const pct = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 2) : 0;
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
          <div style="width: 140px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
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
    });
    html += `</div>`;
    this.content.innerHTML = html;
  }

  updateLeaderboard() {
    if (!this._hass || !this.content) return;
    const escapeHTML = gamingStatusEscapeHTML;

    let entityIdsToProcess = gamingStatusLeaderboardEntityIds(this._hass, this.config);

    if (this.config.metric === "steam_total_playtime") {
      this._renderSteamTotalPlaytime(entityIdsToProcess);
      return;
    }

    let finalData = [];

    const isCal = this.config.window === "calendar";
    const windowStart = gamingStatusWindowStart(isCal);

    const getBreakdown = (attrs) => isCal
      ? (attrs.calendar_weekly_breakdown || attrs.total_weekly_breakdown || attrs.weekly_breakdown || attrs.weekly_game_breakdown || {})
      : (attrs.rolling_weekly_breakdown || attrs.weekly_breakdown || attrs.weekly_game_breakdown || {});

    const getLongest = (attrs) => isCal
      ? (attrs.calendar_longest_session || attrs.total_longest_session || attrs.longest_session || "None")
      : (attrs.rolling_longest_session || attrs.longest_session || "None");

    if (this.config.metric === "game_hours" || this.config.metric === "all_time_top_games") {
      // "Top Games" style metrics: aggregate across whatever entities the
      // player filter (single/all/selected) resolved to, keyed by game name.
      const isAllTime = this.config.metric === "all_time_top_games";
      let gamesMap = {};
      for (const entityId of entityIdsToProcess) {
        const stateObj = this._hass.states[entityId];
        if (isAllTime) {
          // all_time_top_games is already a bounded, hours-valued list (see
          // top_n_games in the integration) -- merging multiple entities'
          // already-truncated lists means a game that never cracked any
          // single entity's own top slots could be under-ranked here, same
          // known tradeoff the integration's own Master-sensor merge makes.
          const topGames = stateObj.attributes.all_time_top_games;
          if (Array.isArray(topGames)) {
            for (const entry of topGames) {
              const game = entry.game;
              const hours = parseFloat(entry.hours) || 0;
              if (game && hours > 0) gamesMap[game] = (gamesMap[game] || 0) + hours;
            }
          }
        } else {
          const phBreakdown = this._getPlayHistoryBreakdown(stateObj.attributes, isCal);
          for (const [game, seconds] of Object.entries(phBreakdown)) {
            const mins = Math.floor((parseFloat(seconds) || 0) / 60);
            if (mins > 0) gamesMap[game] = (gamesMap[game] || 0) + mins;
          }
        }
      }
      for (const [game, value] of Object.entries(gamesMap)) {
        finalData.push({
          name: game,
          value: value,
          displayValue: isAllTime ? `${Math.round(value * 10) / 10}h` : this.formatMinutes(value)
        });
      }
    } else {
      for (const entityId of entityIdsToProcess) {
        const stateObj = this._hass.states[entityId];
        const friendlyName = gamingStatusCleanPlayerName(stateObj.attributes.friendly_name || entityId);

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
          const longest = this._windowLongestMinutes(stateObj.attributes, windowStart);
          if (longest !== null) {
            // Session-log based: correctly reads 0 when nobody has played in the
            // window (e.g. Calendar on a Sunday morning) instead of surfacing a
            // stale all-time longest_session from the attribute fallback chain.
            // Append the game from that longest session, e.g. "Josh - Marvel Rivals".
            const label = longest.game ? `${friendlyName} - ${longest.game}` : friendlyName;
            finalData.push({ name: label, value: longest.mins, displayValue: this.formatMinutes(longest.mins) });
          } else {
            const longestStr = getLongest(stateObj.attributes);
            const mins = this.extractMinutes(longestStr);
            finalData.push({ name: friendlyName, value: mins, displayValue: String(longestStr) });
          }
        }
        else if (this.config.metric === "all_time_hours") {
          const hours = parseFloat(stateObj.attributes.all_time_total_hours) || 0;
          finalData.push({ name: friendlyName, value: hours, displayValue: `${hours}h` });
        }
        else if (this.config.metric === "all_time_sessions") {
          const count = parseInt(stateObj.attributes.all_time_session_count) || 0;
          finalData.push({ name: friendlyName, value: count, displayValue: `${count}` });
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
            <div style="width: 140px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
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

    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity);

    const colorPalette = gamingStatusNormalizePalette(this._config);
    const isAllTimeMetric = ['all_time_hours', 'all_time_sessions', 'all_time_top_games', 'steam_total_playtime'].includes(this._config.metric);

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
            <option value="all_time_hours" ${this._config.metric === 'all_time_hours' ? 'selected' : ''}>Top Players: All-Time Total Hours</option>
            <option value="all_time_sessions" ${this._config.metric === 'all_time_sessions' ? 'selected' : ''}>Top Players: All-Time Session Count</option>
            <option value="all_time_top_games" ${this._config.metric === 'all_time_top_games' ? 'selected' : ''}>Top Games: All-Time Hours Per Game (Aggregate)</option>
            <option value="steam_total_playtime" ${this._config.metric === 'steam_total_playtime' ? 'selected' : ''}>Steam Games: Total Playtime</option>
          </select>
        </label>

        <div id="window-selector" style="display: ${isAllTimeMetric ? 'none' : 'block'}">
          <label>Time Window
            <select id="window" .configValue="window">
              <option value="rolling" ${this._config.window !== 'calendar' ? 'selected' : ''}>Rolling (Past 7 Days)</option>
              <option value="calendar" ${this._config.window === 'calendar' ? 'selected' : ''}>Calendar (Since Sunday)</option>
            </select>
          </label>
        </div>

        <label>Player Filter
          <select id="mode" .configValue="mode">
            <option value="all" ${this._config.mode === 'all' || !this._config.mode ? 'selected' : ''}>All Tracked Players</option>
            <option value="single" ${this._config.mode === 'single' ? 'selected' : ''}>Single Player</option>
            <option value="selected" ${this._config.mode === 'selected' ? 'selected' : ''}>Selected Players</option>
          </select>
        </label>

        <div id="single-selector" style="display: ${this._config.mode === 'single' ? 'block' : 'none'}">
          <label>Select Player 
            <select id="single_entity" .configValue="single_entity">
              <option value="" disabled ${!this._config.single_entity ? 'selected' : ''}>Select a player...</option>
              ${entityOptions}
            </select>
          </label>
        </div>

        <div id="selected-selector" style="display: ${this._config.mode === 'selected' ? 'block' : 'none'}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" .configValue="selected_entities" value="${this._config.selected_entities || ''}" placeholder="adam, josh, liv">
            <span class="helper-text">Enter a comma-separated list of player names (or full entity IDs).</span>
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
    const windowSelector = this.shadowRoot.getElementById('window-selector');

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

        if (field === 'metric') {
            const isAllTime = ['all_time_hours', 'all_time_sessions', 'all_time_top_games', 'steam_total_playtime'].includes(value);
            windowSelector.style.display = isAllTime ? 'none' : 'block';
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
    return { title: "", mode: "all", entity: "", selected_entities: "", window: "rolling", max_games: 6, color_palette: "vivid", custom_colors: "", entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN };
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
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
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

    const hash = gamingStatusEntityHash(hass, entityIds)
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
      if (!this._ro) {
        this._ro = gamingStatusWireResize(this._contentEl, gamingStatusRerenderer(this));
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
    const VW = gamingStatusChartWidth(this._contentEl, gamingStatusRerenderer(this));
    if (!VW) return;

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

    gamingStatusWireTooltip(this._contentEl, this._tooltipEl, "rect[data-game]", (rect) => {
      const totalMins = Math.round(parseFloat(rect.dataset.hours) * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      const display = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      return `${rect.dataset.game}: ${display}`;
    });
    gamingStatusWireLegendFocus(this._contentEl, "game");
  }

  _niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(c => c >= v) || v * 1.25;
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
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

    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const mode = this._config.mode || (this._config.entity ? "single" : "all");
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (mode === "single" && !this._config.entity && playerEntities.length) {
      this._config = { ...this._config, entity: playerEntities[0].id };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.entity, (s) => this._esc(s));

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
          <label>Select Player
            <select id="entity">
              <option value="" disabled ${!this._config.entity ? "selected" : ""}>Select a player…</option>
              ${entityOptions}
            </select>
          </label>
        </div>
        <div id="selected-selector" style="display: ${mode === "selected" ? "block" : "none"}">
          <label>Selected Entities:
            <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="adam, josh, liv">
            <span class="helper-text">Comma-separated player names (or full entity IDs). Game hours are aggregated across all selected players.</span>
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

  _esc(s) { return gamingStatusEscapeHTML(s); }
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
      color_mode: "game",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
      show_platform_playnite: true,
      show_platform_custom: true,
      show_platform_discord: true,
      show_header: true,
      show_column_player: true,
      show_column_game: true,
      show_column_platform: true,
      show_column_duration: true,
      show_column_date: true,
      show_column_start: true,
      show_column_end: true,
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
    };
  }

  setConfig(config) {
    // Backward compat: the original single "Time" column (start time only)
    // is now split into separate Start/End columns.
    const legacyTime = config.show_column_time !== false;
    this.config = {
      ...config,
      title: config.title || "",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || "",
      max_sessions: config.max_sessions !== undefined ? Math.min(20, Math.max(1, parseInt(config.max_sessions) || 10)) : 10,
      background: config.background || "art",
      // Backward compat: the old boolean toggle only ever offered the
      // platform-tint look; anyone who had it off gets the new default
      // (dynamic game-color tint) instead of losing color entirely.
      color_mode: config.color_mode || (config.use_platform_colors === true ? "platform" : "game"),
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
      show_platform_playnite: config.show_platform_playnite !== false,
      show_platform_custom: config.show_platform_custom !== false,
      show_platform_discord: config.show_platform_discord !== false,
      show_header: config.show_header !== false,
      show_column_player: config.show_column_player !== false,
      show_column_game: config.show_column_game !== false,
      show_column_platform: config.show_column_platform !== false,
      show_column_duration: config.show_column_duration !== false,
      show_column_date: config.show_column_date !== false,
      show_column_start: config.show_column_start !== undefined ? config.show_column_start !== false : legacyTime,
      show_column_end: config.show_column_end !== undefined ? config.show_column_end !== false : legacyTime,
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
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
      + "|" + this.config.color_mode
      + "|" + this.config.show_header
      + "|" + [this.config.show_column_player, this.config.show_column_game, this.config.show_column_platform, this.config.show_column_duration, this.config.show_column_date, this.config.show_column_start, this.config.show_column_end].join(",")
      + "|" + [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation, this.config.show_platform_playnite, this.config.show_platform_custom, this.config.show_platform_discord].join(",");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(this.processData(entityIds));
  }

  processData(entityIds) {
    let rows = [];
    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const playerName = gamingStatusCleanPlayerName(stateObj.attributes.friendly_name || entityId);
      const avatar = stateObj.attributes.entity_picture || "";
      const sessions = stateObj.attributes.recent_sessions || [];

      for (const s of sessions) {
        const platformLower = (s.platform || "").toLowerCase();
        const platformKey = Object.keys(GAMING_STATUS_PLATFORM_TINTS).find(k => platformLower.includes(k));
        if (platformKey && this.config[`show_platform_${platformKey}`] === false) continue;

        rows.push({
          player: playerName,
          avatar,
          game: s.game || "Unknown",
          platform: s.platform || "",
          duration_seconds: parseInt(s.duration_seconds) || 0,
          date: s.date || "",
          start_time: s.start_time || "",
          end_time: s.end_time || "",
          hero_art_url: s.hero_art_url || "",
          game_dominant_color: s.game_dominant_color || "",
        });
      }
    }

    rows.sort((a, b) => (Date.parse(b.start_time) || 0) - (Date.parse(a.start_time) || 0));

    const limit = Math.min(20, Math.max(1, parseInt(this.config.max_sessions) || 10));
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
      { key: "start", label: "Start", flex: "0.9" },
      { key: "end", label: "End", flex: "0.9" },
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

  // Same hex/rgb parsing the List card uses for its "Game Artwork" color mode.
  _parseGameColor(rawColor) {
    if (!rawColor || String(rawColor).toLowerCase() === "null" || String(rawColor).toLowerCase() === "none") return null;
    const str = String(rawColor).trim().toLowerCase();
    if (str.startsWith('#')) {
      let h = str.replace('#', '');
      if (h.length === 3) h = [...h].map(x => x + x).join('');
      if (h.length === 6) {
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `rgb(${r}, ${g}, ${b})`;
      }
      return null;
    }
    if (str.startsWith('rgb')) return str;
    return null;
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
    const escapeHTML = gamingStatusEscapeHTML;
    const colorExtractionEnabled = gamingStatusIsColorExtractionEnabled(this._hass);

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #rs-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }

          .rs-header-row { display: flex; align-items: center; gap: 8px; padding: 0 10px 8px 10px; box-sizing: border-box; }
          .rs-header-cell { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

          .rs-body { display: flex; flex-direction: column; gap: 6px; }
          .rs-body.scrollable { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          .rs-body::-webkit-scrollbar { width: 6px; }
          .rs-body::-webkit-scrollbar-track { background: transparent; }
          .rs-body::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.4); border-radius: 3px; }
          .rs-body::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.8); }

          .rs-row {
            position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); display: flex; align-items: center; gap: 8px;
            padding: 9px 10px; box-sizing: border-box; flex-shrink: 0;
          }
          .rs-row.no-bg { background: var(--secondary-background-color, rgba(120, 120, 120, 0.08)); }
          .rs-row.has-bg::before {
            content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; z-index: 0; pointer-events: none;
            background-size: cover; background-position: center;
            background-image: linear-gradient(to right, var(--rs-tint-start, rgba(0, 0, 0, 0.55)) 0%, var(--rs-tint-end, rgba(0, 0, 0, 0.75)) 100%), var(--rs-bg-url);
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
    this._headerEl.style.display = this.config.show_header !== false ? "flex" : "none";
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
      else if (this.config.background !== "none") bgUrl = row.hero_art_url || row.avatar || "";
      const hasBg = !!bgUrl;

      let tintStyle = "";
      if (hasBg && (this.config.color_mode === "platform" || !colorExtractionEnabled)) {
        const platformLower = (row.platform || "").toLowerCase();
        const tintKey = Object.keys(GAMING_STATUS_PLATFORM_TINTS).find(k => platformLower.includes(k));
        if (tintKey) {
          const rgb = GAMING_STATUS_PLATFORM_TINTS[tintKey];
          // Mirrors the List card's look: a fully opaque color wash on the left
          // that fades into the normal dark overlay (revealing the art) on the right.
          tintStyle = ` --rs-tint-start: rgb(${rgb}); --rs-tint-end: rgba(0, 0, 0, 0.5);`;
        }
      } else if (hasBg) {
        // "game" (dynamic) mode - color each row from that session's own
        // recorded dominant color. Sessions logged before this field existed
        // have none, so they just keep the plain black gradient below.
        const parsedGameColor = this._parseGameColor(row.game_dominant_color);
        if (parsedGameColor) {
          tintStyle = ` --rs-tint-start: ${parsedGameColor}; --rs-tint-end: rgba(0, 0, 0, 0.5);`;
        }
      }

      const cellsHTML = columns.map(c => {
        let value = "";
        let cls = "rs-cell";
        switch (c.key) {
          case "player": value = escapeHTML(row.player); cls += " primary"; break;
          case "game": value = escapeHTML(row.game); cls += " primary"; break;
          case "platform": value = escapeHTML(row.platform); break;
          case "duration": value = escapeHTML(this._formatDuration(row.duration_seconds)); break;
          case "date": value = escapeHTML(this._formatDate(row.date)); break;
          case "start": value = escapeHTML(this._formatTime(row.start_time)); break;
          case "end": value = escapeHTML(this._formatTime(row.end_time)); break;
        }
        return `<div class="${cls}" style="flex: ${c.flex};">${value}</div>`;
      }).join("");

      return `<div class="rs-row ${hasBg ? "has-bg" : "no-bg"}" style="${hasBg ? `--rs-bg-url: url('${bgUrl}');${tintStyle}` : ""}">${cellsHTML}</div>`;
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
    // Home Assistant echoes our own config-changed dispatches back through
    // setConfig(). For fields that update live on every keystroke (Number of
    // Sessions), rebuilding the whole form here would destroy and recreate
    // the input mid-typing and steal focus. Skip the rebuild when this is
    // just an echo of what we already have.
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const colorExtractionEnabled = gamingStatusIsColorExtractionEnabled(this._hass);

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
        .inline-apply { display: flex; gap: 8px; align-items: center; }
        .inline-apply input { flex: 1; }
        .inline-apply button { padding: 8px 14px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .inline-apply button:hover { opacity: 0.9; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only show sessions from the checked platforms.</div>
          <div class="checkbox-group">
            ${Object.keys(GAMING_STATUS_PLATFORM_LABELS)
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
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
          <div class="helper-text">Comma-separated player names (or full entity IDs) to include.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="adam, josh, liv">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Number of Sessions to Display</div>
          <div class="helper-text">Shows the most recently completed sessions, newest first (1-20). If more than 10 would be shown, the list scrolls instead of growing taller. Click Apply to confirm the value.</div>
          <div class="inline-apply">
            <input type="number" id="max_sessions" value="${parseInt(this._config.max_sessions) || 10}" min="1" max="20">
            <button type="button" id="max_sessions_apply">Apply</button>
          </div>
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
        ${this._config.background !== "none" && colorExtractionEnabled ? `
        <div>
          <div class="section-title">Color Mode</div>
          <div class="radio-group">
            <label><input type="radio" name="color_mode" data-field="color_mode" value="game" ${this._config.color_mode !== "platform" ? "checked" : ""}> Game Artwork (Dynamic)</label>
            <label><input type="radio" name="color_mode" data-field="color_mode" value="platform" ${this._config.color_mode === "platform" ? "checked" : ""}> Platform Native (Pre-Defined)</label>
          </div>
          <div class="helper-text">Tint each row's blurred background with that session's own game color, or with a fixed color per platform (Steam blue, Xbox green, etc).</div>
        </div>` : ""}
        <hr>
        <div>
          <label><input type="checkbox" data-field="show_header" ${this._config.show_header !== false ? "checked" : ""}> Show Header Row</label>
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
            <label><input type="checkbox" data-field="show_column_start" ${this._config.show_column_start !== false ? "checked" : ""}> Start</label>
            <label><input type="checkbox" data-field="show_column_end" ${this._config.show_column_end !== false ? "checked" : ""}> End</label>
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

    // Typing alone never dispatches a config change (avoids the HA editor's
    // config-changed -> setConfig -> re-render round trip stealing focus
    // mid-keystroke). The value is only read, clamped, and applied on click.
    this.shadowRoot.getElementById("max_sessions_apply").addEventListener("click", () => {
      const input = this.shadowRoot.getElementById("max_sessions");
      const clamped = Math.min(20, Math.max(1, parseInt(input.value) || 10));
      input.value = clamped;
      this._config = { ...this._config, max_sessions: clamped };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="background"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, background: ev.target.value };
        fireChanged();
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll('input[name="color_mode"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, color_mode: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 7B: GAMING STATUS - RECENT ACHIEVEMENTS
// ====================================================================
// Sibling to Recent Sessions above -- same shape (title, all/single/
// selected player filter, count-to-display with the same scroll
// mechanism, background, color mode, header toggle, column toggles) but
// reads the recent_achievements attribute (an achievement/trophy unlock
// history, persisted and accumulated across games -- unlike the older
// recent_unlocked_achievements/recent_unlocked_trophies attributes, which
// only ever reflect whatever game is currently being played) instead of
// recent_sessions, and only offers the three platforms that ever produce
// achievement data (Steam/Xbox/PlayStation -- Custom/Discord/Playnite
// never do).

class GamingStatusRecentAchievementsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-recent-achievements-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      max_achievements: 10,
      background: "art",
      color_mode: "platform",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
      show_header: true,
      show_column_player: true,
      show_column_game: true,
      show_column_platform: true,
      show_column_achievement: true,
      show_column_date: true,
      show_column_time: true,
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      title: config.title || "",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || "",
      max_achievements: config.max_achievements !== undefined ? Math.min(20, Math.max(1, parseInt(config.max_achievements) || 10)) : 10,
      background: config.background || "art",
      // Unlike Recent Sessions, this card has no working "dynamic game
      // color" mode -- game_dominant_color is only ever populated for a
      // title tracked live through real-time play, and most achievement
      // entries here come from the library scan instead (a game not
      // currently/recently being played is the whole point of that
      // feature), so it's essentially always empty. Only "platform" and
      // "none" are real options; any other stored value (including a
      // pre-existing "game" from before this was simplified) normalizes
      // to "platform".
      color_mode: config.color_mode === "none" ? "none" : "platform",
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
      show_header: config.show_header !== false,
      show_column_player: config.show_column_player !== false,
      show_column_game: config.show_column_game !== false,
      show_column_platform: config.show_column_platform !== false,
      show_column_achievement: config.show_column_achievement !== false,
      show_column_date: config.show_column_date !== false,
      show_column_time: config.show_column_time !== false,
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
    } else {
      entityIds = Object.keys(hass.states).filter(
        k => (k.startsWith("sensor.gaming_status_") || k.startsWith("binary_sensor.gaming_status_")) &&
             k.endsWith(this.config.entities_pattern) &&
             hass.states[k].attributes.secondary !== undefined
      );
    }
    entityIds.sort();

    const trackingEnabled = gamingStatusIsAchievementTrackingEnabled(hass);

    const hash = entityIds.map(id => {
      const unlocks = hass.states[id]?.attributes?.recent_achievements || [];
      // A refresh can patch icon_url onto an already-recorded entry in place
      // (see sensor.py's _ingest_recent_unlocks) without changing the count
      // or the newest entry's timestamp -- fold in an icon-presence flag per
      // unlock too, or that kind of update would never trigger a re-render.
      const iconFlags = unlocks.map(u => u.icon_url ? "1" : "0").join("");
      return `${id}:${unlocks.length}:${unlocks[0] ? unlocks[0].unlocked_at : ""}:${iconFlags}`;
    }).join(",")
      + "|" + trackingEnabled
      + "|" + this.config.max_achievements
      + "|" + this.config.background
      + "|" + this.config.color_mode
      + "|" + this.config.show_header
      + "|" + [this.config.show_column_player, this.config.show_column_game, this.config.show_column_platform, this.config.show_column_achievement, this.config.show_column_date, this.config.show_column_time].join(",")
      + "|" + [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].join(",");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(trackingEnabled ? this.processData(entityIds) : [], trackingEnabled);
  }

  processData(entityIds) {
    let rows = [];
    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const playerName = gamingStatusCleanPlayerName(stateObj.attributes.friendly_name || entityId);
      const avatar = stateObj.attributes.entity_picture || "";
      const unlocks = stateObj.attributes.recent_achievements || [];

      for (const u of unlocks) {
        const platformLower = (u.platform || "").toLowerCase();
        const platformKey = ["steam", "xbox", "playstation"].find(k => platformLower.includes(k));
        if (platformKey && this.config[`show_platform_${platformKey}`] === false) continue;

        rows.push({
          player: playerName,
          avatar,
          game: u.game || "Unknown",
          platform: u.platform || "",
          console: u.console || "",
          name: u.name || "",
          unlocked_at: u.unlocked_at || "",
          hero_art_url: u.hero_art_url || "",
          icon_url: u.icon_url || "",
        });
      }
    }

    rows.sort((a, b) => (Date.parse(b.unlocked_at) || 0) - (Date.parse(a.unlocked_at) || 0));

    const limit = Math.min(20, Math.max(1, parseInt(this.config.max_achievements) || 10));
    return rows.slice(0, limit);
  }

  _getVisibleColumns() {
    const isSingle = this.config.mode === "single";
    const ALL_COLUMNS = [
      { key: "player", label: "Player", flex: "1.2" },
      { key: "game", label: "Game", flex: "1.6" },
      { key: "platform", label: "Platform", flex: "1" },
      { key: "achievement", label: "Achievement", flex: "2" },
      { key: "date", label: "Date", flex: "0.9" },
      { key: "time", label: "Time", flex: "0.9" },
    ];
    return ALL_COLUMNS.filter(c => {
      if (c.key === "player") return !isSingle && this.config.show_column_player;
      return this.config[`show_column_${c.key}`];
    });
  }

  _formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  _formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  render(rows, trackingEnabled) {
    const escapeHTML = gamingStatusEscapeHTML;

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #ra-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }

          .ra-header-row { display: flex; align-items: center; gap: 8px; padding: 0 10px 8px 10px; box-sizing: border-box; }
          .ra-header-cell { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

          .ra-body { display: flex; flex-direction: column; gap: 6px; }
          .ra-body.scrollable { overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
          .ra-body::-webkit-scrollbar { width: 6px; }
          .ra-body::-webkit-scrollbar-track { background: transparent; }
          .ra-body::-webkit-scrollbar-thumb { background: rgba(120, 120, 120, 0.4); border-radius: 3px; }
          .ra-body::-webkit-scrollbar-thumb:hover { background: rgba(120, 120, 120, 0.8); }

          .ra-row {
            position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); display: flex; align-items: center; gap: 8px;
            padding: 9px 10px; box-sizing: border-box; flex-shrink: 0;
          }
          .ra-row.no-bg { background: var(--secondary-background-color, rgba(120, 120, 120, 0.08)); }
          .ra-row.has-bg::before {
            content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px; z-index: 0; pointer-events: none;
            background-size: cover; background-position: center;
            background-image: linear-gradient(to right, var(--ra-tint-start, rgba(0, 0, 0, 0.55)) 0%, var(--ra-tint-end, rgba(0, 0, 0, 0.75)) 100%), var(--ra-bg-url);
            filter: blur(6px);
          }

          .ra-cell { position: relative; z-index: 1; font-size: 13px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .ra-cell.primary { font-weight: 600; }
          .ra-row.has-bg .ra-cell { color: #ffffff; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); }
          .ra-achievement-icon { width: 20px; height: 20px; border-radius: 4px; object-fit: cover; vertical-align: middle; margin-right: 6px; flex-shrink: 0; }

          .ra-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="ra-title"></div>
          <div id="ra-header" class="ra-header-row"></div>
          <div id="ra-body" class="ra-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("ra-title");
      this._headerEl = this.shadowRoot.getElementById("ra-header");
      this._bodyEl = this.shadowRoot.getElementById("ra-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    const columns = this._getVisibleColumns();
    this._headerEl.style.display = (this.config.show_header !== false && trackingEnabled) ? "flex" : "none";
    this._headerEl.innerHTML = columns.map(c => `<div class="ra-header-cell" style="flex: ${c.flex};">${c.label}</div>`).join("");

    if (!trackingEnabled) {
      this._bodyEl.style.maxHeight = "";
      this._bodyEl.classList.remove("scrollable");
      this._bodyEl.innerHTML = `<div class="ra-empty">Achievement/Trophy Tracking isn't enabled. Turn it on under Achievements &amp; Ratings to start building this history.</div>`;
      return;
    }

    // Same fixed-10-row scroll cap Recent Sessions uses.
    if (rows.length > 10) {
      const rowH = 40, gap = 6;
      this._bodyEl.style.maxHeight = `${(rowH * 10) + (gap * 9)}px`;
      this._bodyEl.classList.add("scrollable");
    } else {
      this._bodyEl.style.maxHeight = "";
      this._bodyEl.classList.remove("scrollable");
    }

    if (!rows.length) {
      this._bodyEl.innerHTML = `<div class="ra-empty">No recent achievements found.</div>`;
      return;
    }

    this._bodyEl.innerHTML = rows.map(row => {
      let bgUrl = "";
      if (this.config.background === "avatar") bgUrl = row.avatar;
      else if (this.config.background === "icon") bgUrl = row.icon_url || row.hero_art_url || row.avatar || "";
      else if (this.config.background !== "none") bgUrl = row.hero_art_url || row.avatar || "";
      const hasBg = !!bgUrl;

      let tintStyle = "";
      if (hasBg && this.config.color_mode !== "none") {
        const platformLower = (row.platform || "").toLowerCase();
        const tintKey = Object.keys(GAMING_STATUS_PLATFORM_TINTS).find(k => platformLower.includes(k));
        if (tintKey) {
          const rgb = GAMING_STATUS_PLATFORM_TINTS[tintKey];
          tintStyle = ` --ra-tint-start: rgb(${rgb}); --ra-tint-end: rgba(0, 0, 0, 0.5);`;
        }
      }

      const cellsHTML = columns.map(c => {
        let value = "";
        let cls = "ra-cell";
        switch (c.key) {
          case "player": value = escapeHTML(row.player); cls += " primary"; break;
          case "game": value = escapeHTML(row.game); cls += " primary"; break;
          // The specific console (e.g. "PS4") wins over the generic
          // platform label when known -- more useful for telling apart
          // same-titled console variants of a game.
          case "platform": value = escapeHTML(row.console || row.platform); break;
          case "achievement":
            value = (row.icon_url ? `<img class="ra-achievement-icon" src="${escapeHTML(row.icon_url)}" alt="" loading="lazy">` : "") + escapeHTML(row.name);
            break;
          case "date": value = escapeHTML(this._formatDate(row.unlocked_at)); break;
          case "time": value = escapeHTML(this._formatTime(row.unlocked_at)); break;
        }
        return `<div class="${cls}" style="flex: ${c.flex};">${value}</div>`;
      }).join("");

      return `<div class="ra-row ${hasBg ? "has-bg" : "no-bg"}" style="${hasBg ? `--ra-bg-url: url('${bgUrl}');${tintStyle}` : ""}">${cellsHTML}</div>`;
    }).join("");
  }

  getCardSize() {
    return 4;
  }
}

class GamingStatusRecentAchievementsEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    // Same focus-preserving echo-guard as the Recent Sessions editor -- HA
    // echoes our own config-changed dispatches back through setConfig(), and
    // rebuilding the form on every one of those would steal focus mid-typing.
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const achievementPlatforms = ["steam", "xbox", "playstation"];

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
        .inline-apply { display: flex; gap: 8px; align-items: center; }
        .inline-apply input { flex: 1; }
        .inline-apply button { padding: 8px 14px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .inline-apply button:hover { opacity: 0.9; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only show achievements/trophies from the checked platforms.</div>
          <div class="checkbox-group">
            ${achievementPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
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
          <div class="helper-text">Comma-separated player names (or full entity IDs) to include.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="adam, josh, liv">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Number of Achievements to Display</div>
          <div class="helper-text">Shows the most recently unlocked achievements/trophies, newest first (1-20). If more than 10 would be shown, the list scrolls instead of growing taller. Click Apply to confirm the value.</div>
          <div class="inline-apply">
            <input type="number" id="max_achievements" value="${parseInt(this._config.max_achievements) || 10}" min="1" max="20">
            <button type="button" id="max_achievements_apply">Apply</button>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Background</div>
          <div class="radio-group">
            <label><input type="radio" name="background" data-field="background" value="art" ${this._config.background !== "avatar" && this._config.background !== "none" && this._config.background !== "icon" ? "checked" : ""}> Game Artwork</label>
            <label><input type="radio" name="background" data-field="background" value="icon" ${this._config.background === "icon" ? "checked" : ""}> Achievement Icon</label>
            <label><input type="radio" name="background" data-field="background" value="avatar" ${this._config.background === "avatar" ? "checked" : ""}> Player Avatar</label>
            <label><input type="radio" name="background" data-field="background" value="none" ${this._config.background === "none" ? "checked" : ""}> None</label>
          </div>
          <div class="helper-text">Achievement Icon falls back to the game's artwork (then the player's avatar) for any unlock that doesn't have its own icon captured yet.</div>
        </div>
        ${this._config.background !== "none" ? `
        <div>
          <div class="section-title">Color Mode</div>
          <div class="radio-group">
            <label><input type="radio" name="color_mode" data-field="color_mode" value="none" ${this._config.color_mode === "none" ? "checked" : ""}> None</label>
            <label><input type="radio" name="color_mode" data-field="color_mode" value="platform" ${this._config.color_mode !== "none" ? "checked" : ""}> Platform Native</label>
          </div>
          <div class="helper-text">Tint each row's blurred background with a fixed color per platform (Steam blue, Xbox green, etc), or leave it untinted.</div>
        </div>` : ""}
        <hr>
        <div>
          <label><input type="checkbox" data-field="show_header" ${this._config.show_header !== false ? "checked" : ""}> Show Header Row</label>
        </div>
        <hr>
        <div>
          <div class="section-title">Visible Columns</div>
          <div class="checkbox-group">
            ${mode !== "single" ? `<label><input type="checkbox" data-field="show_column_player" ${this._config.show_column_player !== false ? "checked" : ""}> Player</label>` : ""}
            <label><input type="checkbox" data-field="show_column_game" ${this._config.show_column_game !== false ? "checked" : ""}> Game</label>
            <label><input type="checkbox" data-field="show_column_platform" ${this._config.show_column_platform !== false ? "checked" : ""}> Platform</label>
            <label><input type="checkbox" data-field="show_column_achievement" ${this._config.show_column_achievement !== false ? "checked" : ""}> Achievement</label>
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

    this.shadowRoot.getElementById("max_achievements_apply").addEventListener("click", () => {
      const input = this.shadowRoot.getElementById("max_achievements");
      const clamped = Math.min(20, Math.max(1, parseInt(input.value) || 10));
      input.value = clamped;
      this._config = { ...this._config, max_achievements: clamped };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="background"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, background: ev.target.value };
        fireChanged();
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll('input[name="color_mode"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, color_mode: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 8: GAMING STATUS - GAME MANAGEMENT
// ====================================================================

// Converts an <input type="datetime-local"> value (e.g. "2026-07-18T12:37",
// no seconds/offset -- always parsed by the browser as local time) into the
// ISO-with-local-offset format already used throughout stored session data
// (e.g. "2026-07-18T12:37:00-04:00"). Returns null for an empty/invalid value.
function gamingStatusLocalDateTimeToISO(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  return `${value}:00${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;
}

// Formats the current moment as a local "YYYY-MM-DDTHH:mm" string, matching
// the value format of <input type="datetime-local">, for use as its `max`.
function gamingStatusNowLocalDateTimeString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

class GamingStatusGameManagementCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._selectedAction = "rename";
    this._selectedPlayerId = "";
    this._selectedPlatform = "";
    this._selectedGame = "";
    this._selectedSessionStartTime = "";
    this._newName = "";
    this._addGame = "";
    this._addStartTime = "";
    this._addEndTime = "";
    this._reassignToPlayerId = "";
    this._reassignToPlatform = "";
    this._status = null;
  }

  static getConfigElement() {
    return document.createElement("gaming-status-game-management-editor");
  }

  static getStubConfig() {
    return { title: "", mode: "all", single_entity: "" };
  }

  setConfig(config) {
    this.config = {
      ...config,
      title: config.title || "",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
    };
    this._lastHash = "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    this._resolveTarget();

    // Hash on the actual game list/totals (what _getGameOptions derives and
    // the dropdown displays), not just session count/dates — a rename or
    // delete leaves both of those unchanged (same sessions, same days, just
    // relabeled or reduced totals), so hashing them made the card miss its
    // own service-triggered updates and only show fresh data after a full
    // reload. Also append every session's own start_time: deleting an
    // individual session that's already aged out of the totals above (its
    // seconds no longer counted in play_history, only in the raw session
    // log) would otherwise leave this hash unchanged and skip the re-render,
    // stranding a stale, still-clickable "Delete Session" control.
    const gameOptions = this._getGameOptions(this._targetEntityId);
    const stateObj = this._targetEntityId ? this._hass.states[this._targetEntityId] : null;
    const sessionIds = ((stateObj && stateObj.attributes.recent_sessions) || []).map(s => s.start_time).join(",");
    const hash = [
      this._selectedPlayerId,
      this._selectedPlatform,
      gameOptions.map(g => `${g.game}:${g.totalSeconds}:${g.achievementCount}`).join(","),
      sessionIds,
    ].join("|");

    if (this._lastHash === hash && this.content) return;
    this._lastHash = hash;

    this.render();
  }

  // Resolves which player + which of their entities (master, or one specific
  // platform sensor) game data should be read from and service calls scoped
  // to. Shared by set hass() and the player/platform <select> change handlers
  // so both paths stay in sync without waiting for a fresh hass push.
  _resolveTarget() {
    const players = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);

    let playerId = this.config.mode === "single" ? this.config.single_entity : this._selectedPlayerId;
    if (!playerId || !this._hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    this._selectedPlayerId = playerId;

    // A specific platform with no sensor for this player (e.g. globally
    // enabled for someone else but not this player) must resolve to nothing
    // rather than silently falling back to the master entity -- otherwise
    // every platform tab would show that player's combined all-platform
    // history, falsely implying each platform tracked all of it.
    let entityId = playerId;
    if (playerId && this._selectedPlatform) {
      const platformEntityId = playerId.replace(/_master$/, `_${this._selectedPlatform}`);
      entityId = this._hass.states[platformEntityId] ? platformEntityId : "";
    }
    this._targetEntityId = entityId;
  }

  // Unions games from recent_sessions + every day in play_history (not just a
  // recent window, since this is a picker, not a trend chart) and sums each
  // game's total seconds across all of play_history for the duration label.
  _getGameOptions(entityId) {
    const stateObj = entityId ? this._hass.states[entityId] : null;
    if (!stateObj) return [];
    const sessions = stateObj.attributes.recent_sessions || [];
    const history = stateObj.attributes.play_history || {};
    const achievements = stateObj.attributes.recent_achievements || [];

    const totals = {};
    for (const dayData of Object.values(history)) {
      if (!dayData || typeof dayData !== "object") continue;
      for (const [game, seconds] of Object.entries(dayData)) {
        totals[game] = (totals[game] || 0) + (parseFloat(seconds) || 0);
      }
    }
    // play_history only covers a rolling ~8-day window (older days get
    // pruned) plus it never includes the still-in-progress current day --
    // recent_sessions (capped by count, not date) can easily hold sessions
    // whose date fell outside that window entirely. Credit those directly
    // from their own duration_seconds instead of leaving them at 0, but skip
    // any date already folded into a play_history day so it isn't counted
    // twice.
    for (const s of sessions) {
      if (!s.game) continue;
      if (s.date && s.date in history) continue;
      totals[s.game] = (totals[s.game] || 0) + (parseFloat(s.duration_seconds) || 0);
    }

    // Achievement/trophy-only games -- discovered via the library scan,
    // never actually tracked as "currently playing" in real time -- have no
    // entry in play_history/recent_sessions at all, so without this they'd
    // have no way to ever appear in this picker. Union them in too, counted
    // by unlock count instead of playtime.
    const achievementCounts = {};
    for (const a of achievements) {
      if (!a.game) continue;
      achievementCounts[a.game] = (achievementCounts[a.game] || 0) + 1;
    }

    const allGames = new Set([...Object.keys(totals), ...Object.keys(achievementCounts)]);
    return Array.from(allGames)
      .sort((a, b) => a.localeCompare(b))
      .map(game => ({
        game,
        totalSeconds: totals[game] || 0,
        achievementCount: achievementCounts[game] || 0,
      }));
  }

  // totalSeconds takes priority since it's the more informative number when
  // both exist; an achievement-only game (0 playtime) falls back to its
  // unlock count instead of a meaningless "0m".
  _formatGameOptionLabel(g) {
    if (g.totalSeconds > 0) return this._formatDuration(g.totalSeconds);
    if (g.achievementCount > 0) return `${g.achievementCount} achievement${g.achievementCount === 1 ? "" : "s"}`;
    return this._formatDuration(0);
  }

  // Delete permanently purges stored history -- an achievement-only game
  // (0 playtime, discovered via the library scan) has no playtime/session
  // history to actually remove, and would simply reappear at its next
  // scheduled scan anyway, so Delete specifically excludes it rather than
  // offering an action that can't accomplish anything. Rename/Reassign are
  // unaffected -- Reassign naturally has nothing to reassign for such a
  // game (no sessions), and Rename is exactly how these get cleaned up.
  _getGameOptionsForAction(entityId, action) {
    const options = this._getGameOptions(entityId);
    if (action !== "delete") return options;
    return options.filter(g => g.totalSeconds > 0);
  }

  // Individual sessions for the selected game, still identifiable by their
  // own start_time. Only sessions still present in recent_sessions (capped
  // at MAX_RECENT_SESSIONS) qualify -- once a session ages out and gets
  // folded into play_history's daily aggregate, its start_time is gone and
  // it can no longer be targeted alone. A plain case-insensitive compare is
  // enough here (no cross-platform title-variant matching needed) since
  // these sessions come from the same entity's data the Game dropdown
  // itself was built from.
  _getSessionsForGame(entityId, game) {
    const stateObj = entityId ? this._hass.states[entityId] : null;
    if (!stateObj || !game) return [];
    const sessions = stateObj.attributes.recent_sessions || [];
    return sessions
      .filter(s => (s.game || "").toLowerCase() === game.toLowerCase())
      .sort((a, b) => (b.start_time || "").localeCompare(a.start_time || ""));
  }

  _formatDuration(seconds) {
    const totalMins = Math.round(seconds / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  // "YYYY-MM-DD" -> "M/D", for compact display in confirmation dialogs.
  _formatDateMD(dateStr) {
    const parts = (dateStr || "").split("-");
    if (parts.length !== 3) return dateStr || "";
    const [, m, d] = parts;
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  }

  // rename_game/delete_game take a plain player NAME (they slugify it
  // themselves to find the matching entities), not an entity id, so resolve
  // the already-cleaned name gamingStatusGetPlayerEntities computed for us.
  _resolvePlayerName(playerId) {
    const players = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    const match = players.find(p => p.id === playerId);
    return match ? match.name : "";
  }

  _setStatus(text, type) {
    this._status = { text, type };
    this._renderStatus();
  }

  _renderStatus() {
    if (!this._statusEl) return;
    if (!this._status) {
      this._statusEl.textContent = "";
      this._statusEl.style.display = "none";
      return;
    }
    this._statusEl.innerHTML = this._status.text;
    this._statusEl.style.display = "block";
    this._statusEl.className = `gm-status ${this._status.type}`;
  }

  // In-card modal used in place of window.confirm() -- the native dialog
  // prefixes itself with the page's origin (e.g. "192.168.1.24:8123 says"),
  // which isn't something a page can suppress or restyle.
  _showConfirm(title, lines) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "gm-confirm-overlay";
      overlay.innerHTML = `
        <div class="gm-confirm-box">
          <div class="gm-confirm-title">${gamingStatusEscapeHTML(title)}</div>
          ${lines.map(l => `<div class="gm-confirm-line">${gamingStatusEscapeHTML(l)}</div>`).join("")}
          <div class="gm-confirm-actions">
            <button class="gm-confirm-cancel">Cancel</button>
            <button class="gm-confirm-yes">Yes</button>
          </div>
        </div>`;
      this.shadowRoot.appendChild(overlay);
      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };
      overlay.querySelector(".gm-confirm-yes").addEventListener("click", () => finish(true));
      overlay.querySelector(".gm-confirm-cancel").addEventListener("click", () => finish(false));
      overlay.addEventListener("click", (ev) => { if (ev.target === overlay) finish(false); });
    });
  }

  async _handleRename() {
    const player = this._resolvePlayerName(this._selectedPlayerId);
    const newName = (this._newName || "").trim();
    if (!player || !this._selectedGame || !newName) return;
    try {
      await this._hass.callService("gaming_status", "rename_game", {
        player,
        ...(this._selectedPlatform ? { platform: this._selectedPlatform } : {}),
        old_name: this._selectedGame,
        new_name: newName,
      });
      this._setStatus(`Renamed <strong>${gamingStatusEscapeHTML(this._selectedGame)}</strong> to <strong>${gamingStatusEscapeHTML(newName)}</strong>.`, "success");
      this._selectedGame = "";
      this._newName = "";
      this._refreshAfterAction();
    } catch (err) {
      this._setStatus(`Rename failed: ${gamingStatusEscapeHTML(String(err?.message || err))}`, "error");
    }
  }

  async _handleDelete() {
    const player = this._resolvePlayerName(this._selectedPlayerId);
    if (!player || !this._selectedGame) return;
    const platformLabel = this._selectedPlatform ? (GAMING_STATUS_PLATFORM_LABELS[this._selectedPlatform] || this._selectedPlatform) : "All Platforms";
    const confirmed = await this._showConfirm("Are you sure you want to completely delete this game?", [
      `Profile: ${player}`,
      `Game: ${this._selectedGame} (${platformLabel})`,
    ]);
    if (!confirmed) return;
    try {
      await this._hass.callService("gaming_status", "delete_game", {
        player,
        ...(this._selectedPlatform ? { platform: this._selectedPlatform } : {}),
        game: this._selectedGame,
      });
      this._setStatus(`Deleted all history for <strong>${gamingStatusEscapeHTML(this._selectedGame)}</strong>.`, "success");
      this._selectedGame = "";
      this._refreshAfterAction();
    } catch (err) {
      this._setStatus(`Delete failed: ${gamingStatusEscapeHTML(String(err?.message || err))}`, "error");
    }
  }

  async _handleDeleteSession() {
    const player = this._resolvePlayerName(this._selectedPlayerId);
    if (!player || !this._selectedGame || !this._selectedSessionStartTime) return;
    const session = this._getSessionsForGame(this._targetEntityId, this._selectedGame)
      .find(s => s.start_time === this._selectedSessionStartTime);
    const confirmed = await this._showConfirm("Are you sure you want to delete this session?", [
      `Profile: ${player}`,
      `Game: ${this._selectedGame}${session?.platform ? ` (${session.platform})` : ""}`,
      session?.date ? `Date: ${this._formatDateMD(session.date)}` : null,
      session?.duration_seconds != null ? `Duration: ${this._formatDuration(session.duration_seconds)}` : null,
    ].filter(Boolean));
    if (!confirmed) return;
    try {
      await this._hass.callService("gaming_status", "delete_session", {
        player,
        ...(this._selectedPlatform ? { platform: this._selectedPlatform } : {}),
        game: this._selectedGame,
        start_time: this._selectedSessionStartTime,
      });
      this._setStatus(`Deleted that session of <strong>${gamingStatusEscapeHTML(this._selectedGame)}</strong>.`, "success");
      this._selectedSessionStartTime = "";
      this._refreshAfterAction();
    } catch (err) {
      this._setStatus(`Delete session failed: ${gamingStatusEscapeHTML(String(err?.message || err))}`, "error");
    }
  }

  async _handleAddSession() {
    const player = this._resolvePlayerName(this._selectedPlayerId);
    const game = (this._addGame || "").trim();
    const startISO = gamingStatusLocalDateTimeToISO(this._addStartTime);
    const endISO = gamingStatusLocalDateTimeToISO(this._addEndTime);
    if (!player || !this._selectedPlatform || !game || !startISO || !endISO) return;
    const now = new Date();
    if (new Date(startISO) > now || new Date(endISO) > now) {
      this._setStatus("Start/end time cannot be in the future.", "error");
      return;
    }
    try {
      await this._hass.callService("gaming_status", "add_session", {
        player,
        platform: this._selectedPlatform,
        game,
        start_time: startISO,
        end_time: endISO,
      });
      this._setStatus(`Added a session of <strong>${gamingStatusEscapeHTML(game)}</strong>.`, "success");
      this._addGame = "";
      this._addStartTime = "";
      this._addEndTime = "";
      this._refreshAfterAction();
    } catch (err) {
      this._setStatus(`Add session failed: ${gamingStatusEscapeHTML(String(err?.message || err))}`, "error");
    }
  }

  async _handleReassignSession() {
    const fromPlayer = this._resolvePlayerName(this._selectedPlayerId);
    const toPlayer = this._resolvePlayerName(this._reassignToPlayerId);
    if (!fromPlayer || !this._selectedGame || !this._selectedSessionStartTime || !toPlayer || !this._reassignToPlatform) return;
    try {
      await this._hass.callService("gaming_status", "reassign_session", {
        from_player: fromPlayer,
        ...(this._selectedPlatform ? { from_platform: this._selectedPlatform } : {}),
        game: this._selectedGame,
        start_time: this._selectedSessionStartTime,
        to_player: toPlayer,
        to_platform: this._reassignToPlatform,
      });
      this._setStatus(`Reassigned that session of <strong>${gamingStatusEscapeHTML(this._selectedGame)}</strong> to <strong>${gamingStatusEscapeHTML(toPlayer)}</strong>.`, "success");
      this._selectedSessionStartTime = "";
      this._reassignToPlayerId = "";
      this._reassignToPlatform = "";
      this._refreshAfterAction();
    } catch (err) {
      this._setStatus(`Reassign failed: ${gamingStatusEscapeHTML(String(err?.message || err))}`, "error");
    }
  }

  // A service call resolving only means the backend accepted the change --
  // this._hass won't reflect the resulting entity state until a later,
  // separate hass push from the dashboard, and nothing guarantees one
  // arrives soon (a rename/delete/reassign changes history attributes, not
  // an entity's live state, so it may not prompt a push at all). Render
  // once now for instant feedback on local-only state (cleared selections),
  // then refetch current states once over the WS API rather than passively
  // waiting -- that's what actually picks up the change without a full page
  // reload. This used to also poll several more times on a delay to cover
  // the "All Platforms" case (the master sensor re-merging off the platform
  // sensor's own state-change event asynchronously) -- that's now handled
  // backend-side instead (the service call doesn't return until master has
  // already recomputed), so a single refetch here is enough. The repeated
  // polling was removed because it was both ineffective at the actual
  // problem and actively harmful: each poll fully rebuilds the card's DOM,
  // which drops focus out of an open dropdown if you clicked back into it
  // while a cycle was still running.
  _refreshAfterAction() {
    this.render();
    this._refetchStates().then(() => this.render());
  }

  async _refetchStates() {
    try {
      const freshStates = await this._hass.callWS({ type: "get_states" });
      const statesById = {};
      for (const s of freshStates) statesById[s.entity_id] = s;
      this._hass = { ...this._hass, states: { ...this._hass.states, ...statesById } };
      this._resolveTarget();
    } catch (e) {
      // No WS connection available (or the call failed) -- fall back to
      // whatever hass we already have; a subsequent natural hass push, or a
      // manual reload, will still eventually pick up the change.
    }
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

  render() {
    const escapeHTML = gamingStatusEscapeHTML;

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #gm-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .gm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
          .gm-field label { font-size: 12px; font-weight: 600; color: var(--secondary-text-color); }
          select, input[type="text"] { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; font-size: 14px; }
          select:focus, input:focus { outline: none; border-color: var(--primary-color); }
          hr { border: 0; border-top: 1px solid var(--divider-color); margin: 4px 0 14px 0; }
          .gm-action-row { display: flex; gap: 8px; align-items: flex-end; }
          .gm-action-row .gm-field { flex: 1; margin-bottom: 0; }
          button { width: 140px; padding: 9px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; white-space: nowrap; text-align: center; flex-shrink: 0; }
          button:disabled { opacity: 0.4; cursor: not-allowed; }
          #gm-rename-btn { background: var(--primary-color); color: var(--text-primary-color, #fff); }
          #gm-rename-btn:not(:disabled):hover { opacity: 0.9; }
          #gm-delete-btn { background: var(--error-color, #db4437); color: #fff; }
          #gm-delete-btn:not(:disabled):hover { opacity: 0.9; }
          #gm-delete-session-btn { background: var(--error-color, #db4437); color: #fff; }
          #gm-delete-session-btn:not(:disabled):hover { opacity: 0.9; }
          #gm-reassign-btn { background: var(--primary-color); color: var(--text-primary-color, #fff); }
          #gm-reassign-btn:not(:disabled):hover { opacity: 0.9; }
          #gm-add-session-btn { background: var(--primary-color); color: var(--text-primary-color, #fff); }
          #gm-add-session-btn:not(:disabled):hover { opacity: 0.9; }
          .gm-status { margin-top: 12px; padding: 8px 10px; border-radius: 4px; font-size: 13px; }
          .gm-status.success { background: rgba(76, 175, 80, 0.15); color: var(--success-color, #4caf50); }
          .gm-status.error { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
          .gm-confirm-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .gm-confirm-box { background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); border-radius: 8px; padding: 20px; max-width: 320px; width: calc(100% - 40px); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); box-sizing: border-box; }
          .gm-confirm-title { font-size: 15px; font-weight: 600; color: var(--primary-text-color); margin-bottom: 12px; }
          .gm-confirm-line { font-size: 13px; color: var(--primary-text-color); margin-bottom: 4px; }
          .gm-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
          .gm-confirm-actions button { width: auto; padding: 8px 16px; }
          .gm-confirm-yes { background: var(--error-color, #db4437); color: #fff; }
          .gm-confirm-cancel { background: var(--secondary-background-color); color: var(--primary-text-color); }
        </style>
        <ha-card>
          <div id="gm-title"></div>
          <div id="gm-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("gm-title");
      this._bodyEl = this.shadowRoot.getElementById("gm-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    const players = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const gameOptions = this._getGameOptionsForAction(this._targetEntityId, this._selectedAction);
    // A game picked under Rename can still be selected internally after
    // switching to Delete (the action switch doesn't clear it) even though
    // Delete's filtered list no longer includes it -- without this, the
    // <select> would silently fall back to showing some other game as
    // selected while this._selectedGame (what a click would actually act
    // on) still pointed at the excluded one.
    if (this._selectedGame && !gameOptions.some(g => g.game === this._selectedGame)) {
      this._selectedGame = "";
    }

    // Action chosen first, then only the fields relevant to it show below --
    // keeps five actions' worth of fields from all being visible at once.
    const actionOptions = [
      { value: "rename", label: "Rename" },
      { value: "add", label: "Add" },
      { value: "delete", label: "Delete" },
      { value: "reassign", label: "Reassign" },
    ].map(a => `<option value="${a.value}" ${this._selectedAction === a.value ? "selected" : ""}>${a.label}</option>`).join("");

    const actionFieldHTML = `
      <div class="gm-field">
        <label>Action</label>
        <select id="gm-action">${actionOptions}</select>
      </div>`;

    const playerFieldHTML = this.config.mode === "single" ? "" : `
      <div class="gm-field">
        <label>Player</label>
        <select id="gm-player">
          ${gamingStatusPlayerOptionsHTML(players, this._selectedPlayerId, escapeHTML)}
        </select>
      </div>`;

    const platformOptions = Object.keys(GAMING_STATUS_PLATFORM_LABELS)
      .filter(key => !availablePlatforms || availablePlatforms.has(key))
      .map(key => `<option value="${key}" ${this._selectedPlatform === key ? "selected" : ""}>${GAMING_STATUS_PLATFORM_LABELS[key]}</option>`)
      .join("");

    const gameSelectOptions = gameOptions.map(g =>
      `<option value="${escapeHTML(g.game)}" ${this._selectedGame === g.game ? "selected" : ""}>${escapeHTML(g.game)} — ${this._formatGameOptionLabel(g)}</option>`
    ).join("");

    // Only rename/delete/reassign operate on an existing game -- add names a
    // brand new one via free text instead, so the picker stays out of the way.
    const gameFieldHTML = this._selectedAction === "add" ? "" : `
      <div class="gm-field">
        <label>Game</label>
        <select id="gm-game" ${!gameOptions.length ? "disabled" : ""}>
          <option value="" ${!this._selectedGame ? "selected" : ""} disabled>${gameOptions.length ? "Select a game…" : "No games found"}</option>
          ${gameSelectOptions}
        </select>
      </div>`;

    const newNameTrimmed = (this._newName || "").trim();
    // Exact (case-sensitive) comparison, not case-insensitive -- the whole
    // point of this field is sometimes a pure capitalization fix (e.g.
    // "Skull And Bones" -> "Skull and Bones"), which the backend's
    // rename_game/_merge_rename already handles correctly (merges into
    // whatever casing already exists, or renames cleanly if not). Blocking
    // on case-insensitive equality would reject exactly that legitimate use
    // case, only a truly identical no-op rename should be disabled.
    const renameEnabled = !!(this._selectedGame && newNameTrimmed && newNameTrimmed !== this._selectedGame);
    const deleteEnabled = !!this._selectedGame;

    // Only sessions still present in recent_sessions are individually
    // addressable (see _getSessionsForGame) -- a game whose only remaining
    // history has already aged into play_history's daily aggregate shows no
    // section here at all, rather than an empty/broken one.
    const sessionOptions = this._selectedGame ? this._getSessionsForGame(this._targetEntityId, this._selectedGame) : [];
    const sessionSelectOptions = sessionOptions.map(s =>
      `<option value="${escapeHTML(s.start_time || "")}" ${this._selectedSessionStartTime === s.start_time ? "selected" : ""}>${escapeHTML(this._formatDate(s.date))} ${escapeHTML(this._formatTime(s.start_time))} (${this._formatDuration(s.duration_seconds)})</option>`
    ).join("");
    const deleteSessionEnabled = !!this._selectedSessionStartTime;

    // Each action-specific section stays out of the DOM entirely (not just
    // disabled) unless its action is the one currently selected AND a game
    // is picked (matches the same conditional-HTML pattern playerFieldHTML
    // already uses above for single-vs-multi-player mode).
    const renameHTML = (this._selectedAction !== "rename" || !this._selectedGame) ? "" : `
      <hr>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Rename to</label>
          <input type="text" id="gm-new-name" placeholder="New name" value="${escapeHTML(this._newName || "")}">
        </div>
        <button id="gm-rename-btn" ${renameEnabled ? "" : "disabled"}>Rename</button>
      </div>`;

    const deleteHTML = (this._selectedAction !== "delete" || !this._selectedGame) ? "" : `
      ${!sessionOptions.length ? "" : `
      <hr>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Session to delete</label>
          <select id="gm-session">
            <option value="" ${!this._selectedSessionStartTime ? "selected" : ""} disabled>Select a session…</option>
            ${sessionSelectOptions}
          </select>
        </div>
        <button id="gm-delete-session-btn" ${deleteSessionEnabled ? "" : "disabled"}>Delete Session</button>
      </div>`}
      <hr>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Delete game from profile</label>
        </div>
        <button id="gm-delete-btn" ${deleteEnabled ? "" : "disabled"}>Delete</button>
      </div>`;

    // Destination platforms for reassignment are scoped to whichever player
    // is currently picked in "Reassign to player" -- mirrors _resolveTarget's
    // own existence-check pattern, so a platform the destination player
    // doesn't actually have configured is never offered.
    const reassignPlatformOptions = !this._reassignToPlayerId ? "" : Object.keys(GAMING_STATUS_PLATFORM_LABELS)
      .filter(key => this._hass.states[this._reassignToPlayerId.replace(/_master$/, `_${key}`)])
      .map(key => `<option value="${key}" ${this._reassignToPlatform === key ? "selected" : ""}>${GAMING_STATUS_PLATFORM_LABELS[key]}</option>`)
      .join("");
    const reassignEnabled = !!(this._selectedSessionStartTime && this._reassignToPlayerId && this._reassignToPlatform);

    const reassignHTML = (this._selectedAction !== "reassign" || !this._selectedGame || !sessionOptions.length) ? "" : `
      <hr>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Session to reassign</label>
          <select id="gm-session">
            <option value="" ${!this._selectedSessionStartTime ? "selected" : ""} disabled>Select a session…</option>
            ${sessionSelectOptions}
          </select>
        </div>
      </div>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Reassign to player</label>
          <select id="gm-reassign-player">
            <option value="" ${!this._reassignToPlayerId ? "selected" : ""} disabled>Select a player…</option>
            ${gamingStatusPlayerOptionsHTML(players, this._reassignToPlayerId, escapeHTML)}
          </select>
        </div>
        <div class="gm-field">
          <label>Reassign to platform</label>
          <select id="gm-reassign-platform" ${!this._reassignToPlayerId ? "disabled" : ""}>
            <option value="" ${!this._reassignToPlatform ? "selected" : ""} disabled>${this._reassignToPlayerId ? "Select a platform…" : "Pick a player first"}</option>
            ${reassignPlatformOptions}
          </select>
        </div>
        <button id="gm-reassign-btn" ${reassignEnabled ? "" : "disabled"}>Reassign</button>
      </div>`;

    // Add Session is independent of an existing game selection -- available
    // as soon as a specific platform (not "All Platforms") is picked above,
    // since a new session must go to exactly one sensor.
    const addNowLocal = gamingStatusNowLocalDateTimeString();
    const addNow = new Date();
    const addStartDate = this._addStartTime ? new Date(this._addStartTime) : null;
    const addEndDate = this._addEndTime ? new Date(this._addEndTime) : null;
    const addFutureError = !!((addStartDate && !isNaN(addStartDate.getTime()) && addStartDate > addNow) || (addEndDate && !isNaN(addEndDate.getTime()) && addEndDate > addNow));
    const addDurationValid = !!(addStartDate && addEndDate && !isNaN(addStartDate.getTime()) && !isNaN(addEndDate.getTime()) && addEndDate > addStartDate && !addFutureError);
    const addDurationText = addDurationValid ? this._formatDuration((addEndDate - addStartDate) / 1000) : "";
    const addSessionEnabled = !!(this._selectedPlayerId && this._selectedPlatform && (this._addGame || "").trim() && addDurationValid);

    const addSessionHTML = (this._selectedAction !== "add" || !this._selectedPlayerId || !this._selectedPlatform) ? "" : `
      <hr>
      <div class="gm-field">
        <label>Add Session — Game Title</label>
        <input type="text" id="gm-add-game" placeholder="Game title" value="${escapeHTML(this._addGame || "")}">
      </div>
      <div class="gm-action-row">
        <div class="gm-field">
          <label>Start time</label>
          <input type="datetime-local" id="gm-add-start" max="${addNowLocal}" value="${escapeHTML(this._addStartTime || "")}">
        </div>
        <div class="gm-field">
          <label>End time</label>
          <input type="datetime-local" id="gm-add-end" max="${addNowLocal}" value="${escapeHTML(this._addEndTime || "")}">
        </div>
      </div>
      <div id="gm-add-duration" style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 10px;">${addFutureError ? `<span style="color: var(--error-color, #db4437);">Start/end time cannot be in the future.</span>` : (addDurationText ? `Duration: ${addDurationText}` : "")}</div>
      <div class="gm-action-row">
        <div class="gm-field"></div>
        <button id="gm-add-session-btn" ${addSessionEnabled ? "" : "disabled"}>Add Session</button>
      </div>`;

    this._bodyEl.innerHTML = `
      ${actionFieldHTML}
      ${playerFieldHTML}
      <div class="gm-field">
        <label>Platform</label>
        <select id="gm-platform">
          <option value="" ${!this._selectedPlatform ? "selected" : ""}>All Platforms</option>
          ${platformOptions}
        </select>
      </div>
      ${gameFieldHTML}
      ${renameHTML}
      ${deleteHTML}
      ${reassignHTML}
      ${addSessionHTML}
      <div id="gm-status" class="gm-status" style="display: none;"></div>
    `;
    this._statusEl = this.shadowRoot.getElementById("gm-status");
    this._renderStatus();

    const actionSelect = this.shadowRoot.getElementById("gm-action");
    if (actionSelect) {
      actionSelect.addEventListener("change", (ev) => {
        this._selectedAction = ev.target.value;
        this._newName = "";
        this._selectedSessionStartTime = "";
        this._reassignToPlayerId = "";
        this._reassignToPlatform = "";
        this._addGame = "";
        this._addStartTime = "";
        this._addEndTime = "";
        this.render();
      });
    }

    const playerSelect = this.shadowRoot.getElementById("gm-player");
    if (playerSelect) {
      playerSelect.addEventListener("change", (ev) => {
        this._selectedPlayerId = ev.target.value;
        this._selectedGame = "";
        this._selectedSessionStartTime = "";
        this._newName = "";
        this._addGame = "";
        this._addStartTime = "";
        this._addEndTime = "";
        this._reassignToPlayerId = "";
        this._reassignToPlatform = "";
        this._resolveTarget();
        this.render();
      });
    }

    this.shadowRoot.getElementById("gm-platform").addEventListener("change", (ev) => {
      this._selectedPlatform = ev.target.value;
      this._selectedGame = "";
      this._selectedSessionStartTime = "";
      this._newName = "";
      this._addGame = "";
      this._addStartTime = "";
      this._addEndTime = "";
      this._reassignToPlayerId = "";
      this._reassignToPlatform = "";
      this._resolveTarget();
      this.render();
    });

    const gameSelect = this.shadowRoot.getElementById("gm-game");
    if (gameSelect) {
      gameSelect.addEventListener("change", (ev) => {
        this._selectedGame = ev.target.value;
        this._selectedSessionStartTime = "";
        this._newName = "";
        this._reassignToPlayerId = "";
        this._reassignToPlatform = "";
        this.render();
      });
    }

    const newNameInput = this.shadowRoot.getElementById("gm-new-name");
    if (newNameInput) {
      newNameInput.addEventListener("input", (ev) => {
        this._newName = ev.target.value;
        const trimmed = this._newName.trim();
        // Exact (case-sensitive) comparison -- see the matching renameEnabled
        // computation in render() for why a case-only fix (e.g. "Skull And
        // Bones" -> "Skull and Bones") must be allowed through, not just an
        // identical no-op rename.
        const enabled = !!(this._selectedGame && trimmed && trimmed !== this._selectedGame);
        this.shadowRoot.getElementById("gm-rename-btn").disabled = !enabled;
      });
    }

    const renameBtn = this.shadowRoot.getElementById("gm-rename-btn");
    if (renameBtn) renameBtn.addEventListener("click", () => this._handleRename());
    const deleteBtn = this.shadowRoot.getElementById("gm-delete-btn");
    if (deleteBtn) deleteBtn.addEventListener("click", () => this._handleDelete());

    // Shared by both Delete's and Reassign's session picker -- only one of
    // the two is ever actually in the DOM at a time (they're mutually
    // exclusive action tabs), so each button lookup is guarded individually
    // rather than assumed to exist.
    const sessionSelect = this.shadowRoot.getElementById("gm-session");
    if (sessionSelect) {
      sessionSelect.addEventListener("change", (ev) => {
        this._selectedSessionStartTime = ev.target.value;
        const deleteSessionBtnEl = this.shadowRoot.getElementById("gm-delete-session-btn");
        if (deleteSessionBtnEl) deleteSessionBtnEl.disabled = !this._selectedSessionStartTime;
        const reassignBtn = this.shadowRoot.getElementById("gm-reassign-btn");
        if (reassignBtn) reassignBtn.disabled = !(this._selectedSessionStartTime && this._reassignToPlayerId && this._reassignToPlatform);
      });
    }
    const deleteSessionBtn = this.shadowRoot.getElementById("gm-delete-session-btn");
    if (deleteSessionBtn) deleteSessionBtn.addEventListener("click", () => this._handleDeleteSession());

    const reassignPlayerSelect = this.shadowRoot.getElementById("gm-reassign-player");
    if (reassignPlayerSelect) {
      reassignPlayerSelect.addEventListener("change", (ev) => {
        this._reassignToPlayerId = ev.target.value;
        this._reassignToPlatform = "";
        this.render();
      });
    }
    const reassignPlatformSelect = this.shadowRoot.getElementById("gm-reassign-platform");
    if (reassignPlatformSelect) {
      reassignPlatformSelect.addEventListener("change", (ev) => {
        this._reassignToPlatform = ev.target.value;
        const reassignBtn = this.shadowRoot.getElementById("gm-reassign-btn");
        if (reassignBtn) reassignBtn.disabled = !(this._selectedSessionStartTime && this._reassignToPlayerId && this._reassignToPlatform);
      });
    }
    const reassignBtn = this.shadowRoot.getElementById("gm-reassign-btn");
    if (reassignBtn) reassignBtn.addEventListener("click", () => this._handleReassignSession());

    const addGameInput = this.shadowRoot.getElementById("gm-add-game");
    const addStartInput = this.shadowRoot.getElementById("gm-add-start");
    const addEndInput = this.shadowRoot.getElementById("gm-add-end");
    const updateAddSessionState = () => {
      const addSessionBtn = this.shadowRoot.getElementById("gm-add-session-btn");
      if (!addSessionBtn) return;
      const s = addStartInput && addStartInput.value ? new Date(addStartInput.value) : null;
      const e = addEndInput && addEndInput.value ? new Date(addEndInput.value) : null;
      const durationValid = !!(s && e && !isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s);
      const durationEl = this.shadowRoot.getElementById("gm-add-duration");
      if (durationEl) durationEl.textContent = durationValid ? `Duration: ${this._formatDuration((e - s) / 1000)}` : "";
      addSessionBtn.disabled = !(this._selectedPlayerId && this._selectedPlatform && (this._addGame || "").trim() && durationValid);
    };
    if (addGameInput) {
      addGameInput.addEventListener("input", (ev) => {
        this._addGame = ev.target.value;
        updateAddSessionState();
      });
    }
    if (addStartInput) {
      addStartInput.addEventListener("input", (ev) => {
        this._addStartTime = ev.target.value;
        updateAddSessionState();
      });
    }
    if (addEndInput) {
      addEndInput.addEventListener("input", (ev) => {
        this._addEndTime = ev.target.value;
        updateAddSessionState();
      });
    }
    const addSessionBtn = this.shadowRoot.getElementById("gm-add-session-btn");
    if (addSessionBtn) addSessionBtn.addEventListener("click", () => this._handleAddSession());
  }

  getCardSize() {
    return 4;
  }
}

class GamingStatusGameManagementEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
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
          <div class="helper-text">"All Players" shows a player picker on the card itself. "Single Player" pins the card to one player.</div>
          <select id="mode">
            <option value="all" ${mode === "all" ? "selected" : ""}>All Players (picker on card)</option>
            <option value="single" ${mode === "single" ? "selected" : ""}>Single Player</option>
          </select>
        </div>
        ${mode === "single" ? `
        <div>
          <div class="section-title">Select Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>` : ""}
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
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 9: GAMING STATUS - ACHIEVEMENT ICONS
// ====================================================================

class GamingStatusAchievementIconsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-achievement-icons-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      mode: "all",
      single_entity: "",
      selected_entities: "",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
      icons_per_row: 4,
      rows: 1,
      icon_background: "none",
      artwork_size: "crop",
      show_hover_player: true,
      show_hover_platform: true,
      show_hover_game: true,
      show_hover_achievement: true,
      show_hover_datetime: true,
      entities_pattern: GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
    };
  }

  setConfig(config) {
    const allowedPerRow = [2, 3, 4, 5, 6];
    this.config = {
      ...config,
      title: config.title || "",
      mode: config.mode || "all",
      single_entity: config.single_entity || "",
      selected_entities: config.selected_entities || "",
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
      icons_per_row: allowedPerRow.includes(parseInt(config.icons_per_row)) ? parseInt(config.icons_per_row) : 4,
      rows: Math.min(5, Math.max(1, parseInt(config.rows) || 1)),
      icon_background: ["black", "white"].includes(config.icon_background) ? config.icon_background : "none",
      artwork_size: config.artwork_size === "contain" ? "contain" : "crop",
      show_hover_player: config.show_hover_player !== false,
      show_hover_platform: config.show_hover_platform !== false,
      show_hover_game: config.show_hover_game !== false,
      show_hover_achievement: config.show_hover_achievement !== false,
      show_hover_datetime: config.show_hover_datetime !== false,
      entities_pattern: config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN,
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
      entityIds = gamingStatusResolveSelectedEntities(hass, this.config.selected_entities, this.config.entities_pattern);
    } else {
      entityIds = Object.keys(hass.states).filter(
        k => (k.startsWith("sensor.gaming_status_") || k.startsWith("binary_sensor.gaming_status_")) &&
             k.endsWith(this.config.entities_pattern) &&
             hass.states[k].attributes.secondary !== undefined
      );
    }
    entityIds.sort();

    const trackingEnabled = gamingStatusIsAchievementTrackingEnabled(hass);

    const hash = entityIds.map(id => {
      const unlocks = hass.states[id]?.attributes?.recent_achievements || [];
      const iconFlags = unlocks.map(u => u.icon_url ? "1" : "0").join("");
      return `${id}:${unlocks.length}:${unlocks[0] ? unlocks[0].unlocked_at : ""}:${iconFlags}`;
    }).join(",")
      + "|" + trackingEnabled
      + "|" + this.config.icons_per_row
      + "|" + this.config.rows
      + "|" + this.config.icon_background
      + "|" + this.config.artwork_size
      + "|" + this.config.mode
      + "|" + [this.config.show_hover_player, this.config.show_hover_platform, this.config.show_hover_game, this.config.show_hover_achievement, this.config.show_hover_datetime].join(",")
      + "|" + [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].join(",");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(trackingEnabled ? this.processData(entityIds) : [], trackingEnabled);
  }

  // Same union-and-sort shape as GamingStatusRecentAchievementsCard.processData,
  // sliced to icons_per_row * rows instead of a flat max_achievements count.
  processData(entityIds) {
    let rows = [];
    for (const entityId of entityIds) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) continue;
      const playerName = gamingStatusCleanPlayerName(stateObj.attributes.friendly_name || entityId);
      const unlocks = stateObj.attributes.recent_achievements || [];

      for (const u of unlocks) {
        const platformLower = (u.platform || "").toLowerCase();
        const platformKey = ["steam", "xbox", "playstation"].find(k => platformLower.includes(k));
        if (platformKey && this.config[`show_platform_${platformKey}`] === false) continue;

        rows.push({
          player: playerName,
          game: u.game || "Unknown",
          platform: u.platform || "",
          console: u.console || "",
          name: u.name || "",
          unlocked_at: u.unlocked_at || "",
          icon_url: u.icon_url || "",
          hero_art_url: u.hero_art_url || "",
        });
      }
    }

    rows.sort((a, b) => (Date.parse(b.unlocked_at) || 0) - (Date.parse(a.unlocked_at) || 0));

    const limit = this.config.icons_per_row * this.config.rows;
    return rows.slice(0, limit);
  }

  _formatDateTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  render(rows, trackingEnabled) {
    const escapeHTML = gamingStatusEscapeHTML;

    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #ai-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .ai-grid { display: grid; gap: 8px; }
          .ai-cell { position: relative; aspect-ratio: 1 / 1; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
          .ai-cell img { width: 100%; height: 100%; }
          .ai-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="ai-title"></div>
          <div id="ai-body"></div>
        </ha-card>
        <div id="ai-tooltip" style="position:fixed;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:6px 10px;border-radius:5px;font-size:12px;line-height:1.5;white-space:normal;max-width:220px;display:none;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      `;
      this._titleEl = this.shadowRoot.getElementById("ai-title");
      this._bodyEl = this.shadowRoot.getElementById("ai-body");
      this._tooltipEl = this.shadowRoot.getElementById("ai-tooltip");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (!trackingEnabled) {
      this._bodyEl.innerHTML = `<div class="ai-empty">Achievement/Trophy Tracking isn't enabled. Turn it on under Achievements &amp; Ratings to start building this history.</div>`;
      return;
    }

    if (!rows.length) {
      this._bodyEl.innerHTML = `<div class="ai-empty">No recent achievements found.</div>`;
      return;
    }

    const bgByMode = { none: "transparent", black: "#000", white: "#fff" };
    const cellBg = bgByMode[this.config.icon_background] || "transparent";
    const objectFit = this.config.artwork_size === "contain" ? "contain" : "cover";

    this._bodyEl.innerHTML = `<div class="ai-grid" style="grid-template-columns: repeat(${this.config.icons_per_row}, 1fr);">` +
      rows.map((row, i) => {
        const imgUrl = row.icon_url || row.hero_art_url || "";
        const inner = imgUrl
          ? `<img src="${escapeHTML(imgUrl)}" alt="" loading="lazy" style="object-fit: ${objectFit};">`
          : `<ha-icon icon="mdi:trophy" style="width: 48px; height: 48px; --mdc-icon-size: 48px; color: var(--secondary-text-color); opacity: 0.6;"></ha-icon>`;
        return `<div class="ai-cell" data-idx="${i}" style="background: ${cellBg};">${inner}</div>`;
      }).join("") +
      `</div>`;

    // "Four MOST RECENT icons" -- recency order is preserved even for older,
    // icon-less entries (the mdi:trophy fallback above), so the hover text
    // (built from the same `rows` array by index) always matches what's
    // actually shown in that cell.
    const isSinglePlayer = this.config.mode === "single";
    gamingStatusWireHtmlTooltip(this._bodyEl, this._tooltipEl, ".ai-cell", (el) => {
      const row = rows[parseInt(el.getAttribute("data-idx"), 10)];
      if (!row) return "";
      const lines = [];
      if (this.config.show_hover_player && !isSinglePlayer) lines.push(escapeHTML(row.player));
      // Platform rides along on the game's line -- "Game Title (Platform)"
      // -- rather than getting its own dedicated line. The specific
      // console (e.g. "PS4") always wins over the generic platform label
      // when known -- more useful, and avoids ever showing both.
      const platformLabel = row.console || GAMING_STATUS_PLATFORM_LABELS[row.platform] || row.platform;
      if (this.config.show_hover_game) {
        lines.push(this.config.show_hover_platform
          ? `${escapeHTML(row.game)} (${escapeHTML(platformLabel)})`
          : escapeHTML(row.game));
      } else if (this.config.show_hover_platform) {
        lines.push(escapeHTML(platformLabel));
      }
      if (this.config.show_hover_achievement) lines.push(escapeHTML(row.name));
      if (this.config.show_hover_datetime) lines.push(escapeHTML(this._formatDateTime(row.unlocked_at)));
      return lines.join("<br>");
    });
  }
}

class GamingStatusAchievementIconsEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const targetSuffix = this._config.entities_pattern || GAMING_STATUS_DEFAULT_ENTITIES_PATTERN;
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, targetSuffix);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, this._config.single_entity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const achievementPlatforms = ["steam", "xbox", "playstation"];

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
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only include unlocks from the checked platforms.</div>
          <div class="checkbox-group">
            ${achievementPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
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
          <div class="helper-text">Comma-separated player names (or full entity IDs) to include.</div>
          <input type="text" id="selected_entities" value="${this._esc(this._config.selected_entities || "")}" placeholder="adam, josh, liv">
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Icons Per Row</div>
          <select id="icons_per_row">
            ${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${parseInt(this._config.icons_per_row) === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="section-title">Rows</div>
          <div class="helper-text">Total icons shown = Icons Per Row &times; Rows.</div>
          <select id="rows">
            ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${parseInt(this._config.rows) === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Icon Background</div>
          <div class="helper-text">Backdrop behind each icon -- useful since some icons have transparent backgrounds.</div>
          <div class="radio-group">
            <label><input type="radio" name="icon_background" data-field="icon_background" value="none" ${this._config.icon_background !== "black" && this._config.icon_background !== "white" ? "checked" : ""}> None (Transparent)</label>
            <label><input type="radio" name="icon_background" data-field="icon_background" value="black" ${this._config.icon_background === "black" ? "checked" : ""}> Black</label>
            <label><input type="radio" name="icon_background" data-field="icon_background" value="white" ${this._config.icon_background === "white" ? "checked" : ""}> White</label>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Artwork Size</div>
          <div class="helper-text">How each achievement's image fills its square cell.</div>
          <div class="radio-group">
            <label><input type="radio" name="artwork_size" data-field="artwork_size" value="crop" ${this._config.artwork_size !== "contain" ? "checked" : ""}> Crop to Square</label>
            <label><input type="radio" name="artwork_size" data-field="artwork_size" value="contain" ${this._config.artwork_size === "contain" ? "checked" : ""}> Show Full Image</label>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Hover Info</div>
          <div class="helper-text">Choose what's shown when hovering over an icon.</div>
          <div class="checkbox-group">
            ${mode !== "single" ? `<label><input type="checkbox" data-field="show_hover_player" ${this._config.show_hover_player !== false ? "checked" : ""}> Player</label>` : ""}
            <label><input type="checkbox" data-field="show_hover_platform" ${this._config.show_hover_platform !== false ? "checked" : ""}> Platform</label>
            <label><input type="checkbox" data-field="show_hover_game" ${this._config.show_hover_game !== false ? "checked" : ""}> Game</label>
            <label><input type="checkbox" data-field="show_hover_achievement" ${this._config.show_hover_achievement !== false ? "checked" : ""}> Achievement</label>
            <label><input type="checkbox" data-field="show_hover_datetime" ${this._config.show_hover_datetime !== false ? "checked" : ""}> Date/Time</label>
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

    this.shadowRoot.getElementById("icons_per_row").addEventListener("change", (ev) => {
      this._config = { ...this._config, icons_per_row: parseInt(ev.target.value) };
      fireChanged();
    });

    this.shadowRoot.getElementById("rows").addEventListener("change", (ev) => {
      this._config = { ...this._config, rows: parseInt(ev.target.value) };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="icon_background"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, icon_background: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[name="artwork_size"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, artwork_size: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 10: GAMING STATUS - PLAYSTATION TROPHIES
// ====================================================================

class GamingStatusPlaystationTrophiesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-playstation-trophies-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      single_entity: "",
      background: "none",
      show_total: true,
      show_labels: true,
      image_style: "official",
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      // No all/single/selected mode on this card (it's always exactly one
      // player) -- "single" is set purely so the shared
      // gamingStatusDefaultSingleEntity helper (which gates on config.mode
      // === "single") works unchanged in the editor.
      mode: "single",
      title: config.title || "",
      single_entity: config.single_entity || "",
      background: ["black", "white"].includes(config.background) ? config.background : "none",
      show_total: config.show_total !== false,
      show_labels: config.show_labels !== false,
      image_style: config.image_style === "icons" ? "icons" : "official",
    };
    this._lastHash = "";
  }

  // Derives sensor.gaming_status_<owner>_library_playstation from the
  // selected player's base ("_master") entity id -- same suffix-replace
  // technique GamingStatusGameManagementCard._resolveTarget already uses.
  // Returns "" if that library sensor doesn't exist (Full Game Library Scan
  // not enabled for PlayStation on this player).
  _resolveTargetEntityId(hass) {
    const players = gamingStatusGetPlayerEntities(hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    let playerId = this.config.single_entity;
    if (!playerId || !hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    if (!playerId) return "";
    const libraryEntityId = playerId.replace(/_master$/, "_library_playstation");
    return hass.states[libraryEntityId] ? libraryEntityId : "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    const targetEntityId = this._resolveTargetEntityId(hass);
    const stateObj = targetEntityId ? hass.states[targetEntityId] : null;

    const hash = [
      targetEntityId,
      stateObj ? stateObj.last_updated : "",
      this.config.background,
      this.config.title,
      this.config.show_total,
      this.config.show_labels,
      this.config.image_style,
    ].join("|");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(stateObj);
  }

  render(stateObj) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #pt-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .pt-row { display: flex; justify-content: space-around; gap: 8px; border-radius: 8px; padding: 14px 0; }
          .pt-cell { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
          .pt-icon-wrap { position: relative; width: 56px; height: 56px; }
          .pt-icon-wrap ha-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
          .pt-icon-wrap img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: contain; }
          .pt-tier-label { font-size: 12px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.03em; }
          .pt-count { font-size: 20px; font-weight: 700; color: var(--primary-text-color); }
          .pt-total { font-size: 11px; color: var(--secondary-text-color); }
          .pt-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="pt-title"></div>
          <div id="pt-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("pt-title");
      this._bodyEl = this.shadowRoot.getElementById("pt-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (!stateObj) {
      this._bodyEl.innerHTML = `<div class="pt-empty">PlayStation Trophy totals require Full Game Library Scan to be enabled for PlayStation.</div>`;
      return;
    }

    const attrs = stateObj.attributes;
    const bgByMode = { none: "transparent", black: "#000", white: "#fff" };
    const cellBg = bgByMode[this.config.background] || "transparent";

    // Colors approximate PSN's own trophy tier look (no single official hex
    // exists for these) -- Bronze/Silver/Gold are the standard metal tones,
    // Platinum approximates PSN's pale "chrome" trophy rather than true
    // white/gray, which would blend into a light-theme background.
    const TIERS = [
      { key: "bronze", label: "Bronze", color: "205, 127, 50", url: "https://static.wikia.nocookie.net/playstation/images/6/65/Bronze_trophy.png" },
      { key: "silver", label: "Silver", color: "192, 192, 192", url: "https://static.wikia.nocookie.net/playstation/images/c/c8/Silver_trophy.png" },
      { key: "gold", label: "Gold", color: "255, 215, 0", url: "https://static.wikia.nocookie.net/playstation/images/f/fd/Gold_trophy.png" },
      { key: "platinum", label: "Platinum", color: "159, 216, 232", url: "https://static.wikia.nocookie.net/playstation/images/2/2d/Platinum_trophy.png" },
    ];

    const useIconsOnly = this.config.image_style === "icons";

    this._bodyEl.innerHTML = `<div class="pt-row" style="background: ${cellBg};">` +
      TIERS.map(t => {
        const earned = attrs[`trophies_${t.key}`];
        const total = attrs[`trophies_${t.key}_total`];
        // Icons-only mode never attempts the official image at all. In
        // "official" mode, the icon starts hidden (display:none) rather
        // than sitting visibly behind the image -- these Wikia PNGs have
        // transparent backgrounds, so a same-size icon behind an
        // always-visible one would peek through the transparent parts.
        // The image's onerror handler reveals the icon (and hides itself)
        // only if the image actually fails to load.
        const imageHtml = useIconsOnly
          ? ""
          : `<img src="${t.url}" alt="" loading="lazy" onerror="this.style.display='none'; this.previousElementSibling.style.removeProperty('display');">`;
        return `
          <div class="pt-cell">
            <div class="pt-icon-wrap">
              <ha-icon icon="mdi:trophy" style="width: 50px; height: 50px; --mdc-icon-size: 50px; color: rgb(${t.color}); ${imageHtml ? "display: none;" : ""}"></ha-icon>
              ${imageHtml}
            </div>
            ${this.config.show_labels ? `<div class="pt-tier-label">${t.label}</div>` : ""}
            <div class="pt-count">${earned != null ? earned : 0}</div>
            ${this.config.show_total ? `<div class="pt-total">of ${total != null ? total : 0}</div>` : ""}
          </div>`;
      }).join("") +
      `</div>`;
  }
}

class GamingStatusPlaystationTrophiesEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
        .radio-group, .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Background</div>
          <div class="radio-group">
            <label><input type="radio" name="background" data-field="background" value="none" ${this._config.background !== "black" && this._config.background !== "white" ? "checked" : ""}> None (Transparent)</label>
            <label><input type="radio" name="background" data-field="background" value="black" ${this._config.background === "black" ? "checked" : ""}> Black</label>
            <label><input type="radio" name="background" data-field="background" value="white" ${this._config.background === "white" ? "checked" : ""}> White</label>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Display</div>
          <div class="checkbox-group">
            <label><input type="checkbox" data-field="show_labels" ${this._config.show_labels !== false ? "checked" : ""}> Show Tier Labels</label>
            <label><input type="checkbox" data-field="show_total" ${this._config.show_total !== false ? "checked" : ""}> Show Total Available</label>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Trophy Images</div>
          <div class="radio-group">
            <label><input type="radio" name="image_style" data-field="image_style" value="official" ${this._config.image_style !== "icons" ? "checked" : ""}> Official Trophy Images</label>
            <label><input type="radio" name="image_style" data-field="image_style" value="icons" ${this._config.image_style === "icons" ? "checked" : ""}> Icons Only</label>
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

    this.shadowRoot.getElementById("single_entity").addEventListener("change", (ev) => {
      this._config = { ...this._config, single_entity: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="background"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, background: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[name="image_style"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, image_style: ev.target.value };
        fireChanged();
      });
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 11: GAMING STATUS - 100% COMPLETION
// ====================================================================

class GamingStatusCompletionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-completion-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      single_entity: "",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
      exclude_playstation_no_platinum: false,
      max_games: 12,
      display_mode: "grid",
      grid_columns: 3,
      grid_max_rows: 3,
      time_per_slide: 5,
      transition_time: 1,
      artwork_mode: "cover",
    };
  }

  setConfig(config) {
    const displayMode = config.display_mode === "slideshow" ? "slideshow" : "grid";
    let artworkMode = ["cover", "hero", "logo", "icon"].includes(config.artwork_mode) ? config.artwork_mode : "cover";
    // Logo/Icon are excluded from Slideshow -- their transparent backgrounds
    // can look broken crossfading over whatever the card's own background
    // is, in a way that's less noticeable in a static grid cell. Reset to
    // Cover if a saved config had one of these selected under Grid and the
    // user then switches to Slideshow.
    if (displayMode === "slideshow" && (artworkMode === "logo" || artworkMode === "icon")) {
      artworkMode = "cover";
    }
    this.config = {
      ...config,
      mode: "single", // see GamingStatusPlaystationTrophiesCard.setConfig for why
      title: config.title || "",
      single_entity: config.single_entity || "",
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
      exclude_playstation_no_platinum: config.exclude_playstation_no_platinum === true,
      max_games: config.max_games !== undefined ? Math.min(50, Math.max(1, parseInt(config.max_games) || 12)) : 12,
      display_mode: displayMode,
      grid_columns: [1, 2, 3, 4].includes(parseInt(config.grid_columns)) ? parseInt(config.grid_columns) : 3,
      grid_max_rows: config.grid_max_rows !== undefined ? Math.max(1, parseInt(config.grid_max_rows) || 3) : 3,
      time_per_slide: config.time_per_slide !== undefined ? parseFloat(config.time_per_slide) || 5 : 5,
      transition_time: config.transition_time !== undefined ? parseFloat(config.transition_time) || 1 : 1,
      artwork_mode: artworkMode,
    };
    this._lastHash = "";
  }

  // Per-artwork-mode fixed box heights so `object-fit: contain` never has to
  // clip -- hero/logo/icon are landscape/square/irregular, so a shorter box
  // suits them better than a tall portrait default. Grid uses these
  // directly; slideshow scales them up since it's the card's sole content
  // there, not one cell among several. Cover is deliberately absent from
  // both maps: it uses an aspect-ratio-preserving box instead of a fixed
  // height (see _renderGrid/_renderSlideshow), so its art always spans the
  // full available width without letterboxing, the same as Hero already
  // does at these fixed sizes.
  static ARTWORK_HEIGHTS = { hero: 120, logo: 100, icon: 120 };
  static ARTWORK_HEIGHTS_SLIDESHOW = { hero: 200, logo: 160, icon: 200 };
  // 2:3 portrait, the common aspect for cover/poster art -- used as a
  // padding-top percentage so cover's box height is always exactly 150% of
  // its own width, regardless of the card's actual rendered width.
  static COVER_ASPECT_PERCENT = 150;

  _artFor(g) {
    const fieldByMode = { cover: "game_cover_art", hero: "game_hero_art", logo: "game_logo_art", icon: "game_icon_art" };
    const primary = g[fieldByMode[this.config.artwork_mode]];
    return primary || g.game_cover_art || g.game_hero_art || "";
  }

  // Derives sensor.gaming_status_<owner>_library_summary -- same technique
  // as GamingStatusPlaystationTrophiesCard, different target sensor.
  _resolveTargetEntityId(hass) {
    const players = gamingStatusGetPlayerEntities(hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    let playerId = this.config.single_entity;
    if (!playerId || !hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    if (!playerId) return "";
    const libraryEntityId = playerId.replace(/_master$/, "_library_summary");
    return hass.states[libraryEntityId] ? libraryEntityId : "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    const targetEntityId = this._resolveTargetEntityId(hass);
    const stateObj = targetEntityId ? hass.states[targetEntityId] : null;
    const games = stateObj ? (stateObj.attributes.games || []) : null;

    const hash = [
      targetEntityId,
      games ? games.filter(g => (g.percent || 0) >= 100).map(g => `${g.title}:${g.platform}`).join(",") : "none",
      this.config.max_games,
      this.config.display_mode,
      this.config.grid_columns,
      this.config.grid_max_rows,
      this.config.time_per_slide,
      this.config.transition_time,
      this.config.artwork_mode,
      [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].join(","),
      this.config.exclude_playstation_no_platinum,
    ].join("|");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(games === null ? null : this.processData(games));
  }

  processData(games) {
    return games
      .filter(g => (g.percent || 0) >= 100)
      .filter(g => this.config[`show_platform_${(g.platform || "").toLowerCase()}`] !== false)
      .filter(g => {
        if (!this.config.exclude_playstation_no_platinum) return true;
        if ((g.platform || "").toLowerCase() !== "playstation") return true;
        return ((g.trophies_total || {}).platinum || 0) > 0;
      })
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      .slice(0, this.config.max_games)
      .map(g => ({
        title: g.title || "Unknown",
        platform: g.platform || "",
        console: g.console || "",
        art: this._artFor(g),
      }));
  }

  render(games) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; overflow: hidden; }
          #cc-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .cc-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
          .cc-grid { display: grid; gap: 8px; }
          .cc-grid.scrollable { overflow-y: auto; }
          .cc-cell { display: flex; border-radius: 8px; overflow: hidden; background: var(--secondary-background-color, rgba(120, 120, 120, 0.08)); }
          .cc-cell img { width: 100%; object-fit: contain; display: block; }
          .cc-slideshow { position: relative; width: 100%; border-radius: 8px; overflow: hidden; background-size: contain; background-repeat: no-repeat; background-position: center; }
          .cc-slide { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; z-index: 1; background-size: contain; background-repeat: no-repeat; background-position: center; }
        </style>
        <ha-card>
          <div id="cc-title"></div>
          <div id="cc-body"></div>
        </ha-card>
        <div id="cc-tooltip" style="position:fixed;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:6px 10px;border-radius:5px;font-size:12px;line-height:1.5;white-space:normal;max-width:220px;display:none;z-index:9999;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      `;
      this._titleEl = this.shadowRoot.getElementById("cc-title");
      this._bodyEl = this.shadowRoot.getElementById("cc-body");
      this._tooltipEl = this.shadowRoot.getElementById("cc-tooltip");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (games === null) {
      this._bodyEl.innerHTML = `<div class="cc-empty">100% Completion requires Full Game Library Scan to be enabled for at least one platform.</div>`;
      return;
    }
    if (!games.length) {
      this._bodyEl.innerHTML = `<div class="cc-empty">No games at 100% completion yet.</div>`;
      return;
    }

    if (this.config.display_mode === "slideshow") {
      this._renderSlideshow(games);
    } else {
      this._renderGrid(games);
    }
  }

  _renderGrid(games) {
    const escapeHTML = gamingStatusEscapeHTML;
    const cols = this.config.grid_columns;
    const isCover = this.config.artwork_mode === "cover";
    // Cover's real per-row height varies with the grid's actual column
    // width (full width, auto height, true aspect preserved) -- this is a
    // best-effort estimate for the scroll-cap budget only, the same
    // "typical content" assumption every other scroll-capped list in this
    // bundle already makes, not a value enforced on the rendered image.
    const rowHeight = isCover ? 180 : GamingStatusCompletionCard.ARTWORK_HEIGHTS[this.config.artwork_mode];
    const gap = 8;
    const maxRows = this.config.grid_max_rows;
    const totalRows = Math.ceil(games.length / cols);

    let gridStyle = `grid-template-columns: repeat(${cols}, 1fr);`;
    if (totalRows > maxRows) {
      gridStyle += ` max-height: ${(rowHeight * maxRows) + (gap * (maxRows - 1))}px;`;
    }

    const imgStyle = isCover ? `width: 100%; height: auto;` : `height: ${rowHeight}px;`;

    this._bodyEl.innerHTML = `<div class="cc-grid${totalRows > maxRows ? " scrollable" : ""}" style="${gridStyle}">` +
      games.map((g, i) => `
        <div class="cc-cell" data-idx="${i}">
          <img src="${escapeHTML(g.art)}" alt="" loading="lazy" style="${imgStyle}">
        </div>`).join("") +
      `</div>`;

    const checkedPlatformCount = [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].filter(Boolean).length;
    gamingStatusWireHtmlTooltip(this._bodyEl, this._tooltipEl, ".cc-cell", (el) => {
      const g = games[parseInt(el.getAttribute("data-idx"), 10)];
      if (!g) return "";
      // Platform rides along on the title's line -- "Game Title (Platform)"
      // -- rather than getting its own dedicated line. The specific
      // console (e.g. "PS4") always wins over the generic platform label
      // when known, and is shown regardless of how many platforms are
      // checked -- unlike the generic label (which only helps once more
      // than one platform is mixed together), a console variant needs
      // disambiguating even within a single, PlayStation-only view.
      if (g.console) {
        return `${escapeHTML(g.title)} (${escapeHTML(g.console)})`;
      }
      if (checkedPlatformCount > 1) {
        const platformLabel = GAMING_STATUS_PLATFORM_LABELS[g.platform] || g.platform;
        return `${escapeHTML(g.title)} (${escapeHTML(platformLabel)})`;
      }
      return escapeHTML(g.title);
    });
  }

  // Reuses GamingSlideshowCard's exact crossfade math/keyframe technique
  // (opacity/z-index swap timed by animation-delay per slide), fed with the
  // filtered 100%-completion list instead of "currently active" entities.
  // No text at all here (title/platform) -- see the plan notes on why a
  // hover tooltip can't distinguish individual slides in this stacked,
  // pure-CSS-animation layout; artwork only.
  _renderSlideshow(games) {
    const escapeHTML = gamingStatusEscapeHTML;
    const isCover = this.config.artwork_mode === "cover";
    // Cover uses a padding-top aspect-ratio box (a real, explicit height
    // the absolutely-positioned .cc-slide children's height:100% can still
    // correctly resolve against -- percentage heights on an absolutely
    // positioned element resolve against its containing block's PADDING
    // box, which padding-top establishes here even though content height
    // is 0) instead of a fixed pixel height, so it always spans the full
    // card width with no letterboxing, same as Hero's fixed size already
    // achieves in practice for a typically-wide hero image.
    const containerStyle = isCover
      ? `padding-top: ${GamingStatusCompletionCard.COVER_ASPECT_PERCENT}%; height: 0;`
      : `height: ${GamingStatusCompletionCard.ARTWORK_HEIGHTS_SLIDESHOW[this.config.artwork_mode]}px;`;

    if (games.length === 1) {
      this._bodyEl.innerHTML = `
        <div class="cc-slideshow" style="${containerStyle} background-image: url('${escapeHTML(games[0].art)}');"></div>`;
      return;
    }

    const t_slide = this.config.time_per_slide;
    const t_trans = this.config.transition_time;
    const loop_duration = games.length * t_slide;
    const a = (t_trans / loop_duration) * 100;
    const b = (t_slide / loop_duration) * 100;
    const b_drop = Math.min(b + 0.001, 99.8);
    const c = Math.min(Math.max(((t_slide + t_trans) / loop_duration) * 100, b_drop + 0.001), 99.9);
    const c_hide = Math.min(c + 0.001, 100);
    const anim_name = `cc_anim_${games.length}_${Math.round(loop_duration)}`;

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
    </style>
    <div class="cc-slideshow" style="${containerStyle} background-image: url('${escapeHTML(games[0].art)}');">`;

    games.forEach((g, index) => {
      const delay = index * t_slide;
      html += `
        <div class="cc-slide" style="animation: ${anim_name} ${loop_duration}s infinite; animation-delay: ${delay}s; background-image: url('${escapeHTML(g.art)}');"></div>`;
    });
    html += `</div>`;

    this._bodyEl.innerHTML = html;
  }
}

class GamingStatusCompletionEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const completionPlatforms = ["steam", "xbox", "playstation"];
    const isGrid = this._config.display_mode !== "slideshow";

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
        .inline-apply { display: flex; gap: 8px; align-items: center; }
        .inline-apply input { flex: 1; }
        .inline-apply button { padding: 8px 14px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .inline-apply button:hover { opacity: 0.9; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only include 100%-complete games from the checked platforms.</div>
          <div class="checkbox-group">
            ${completionPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
        </div>
        ${this._config.show_platform_playstation !== false ? `
        <hr>
        <div>
          <div class="section-title">PlayStation Options</div>
          <div class="checkbox-group">
            <label><input type="checkbox" data-field="exclude_playstation_no_platinum" ${this._config.exclude_playstation_no_platinum === true ? "checked" : ""}> Exclude PlayStation games without platinum trophies</label>
          </div>
          <div class="helper-text">Some PlayStation titles (e.g. Journey) have no platinum trophy at all, so 100% completion is achievable without one. Check this to only show 100%-complete PlayStation games that actually have a platinum.</div>
        </div>` : ""}
        <hr>
        <div>
          <div class="section-title">Max Games to Display</div>
          <div class="inline-apply">
            <input type="number" id="max_games" value="${parseInt(this._config.max_games) || 12}" min="1" max="50">
            <button type="button" id="max_games_apply">Apply</button>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Artwork</div>
          <select id="artwork_mode">
            <option value="cover" ${this._config.artwork_mode === "cover" ? "selected" : ""}>Cover/Grid (Vertical Portrait)</option>
            <option value="hero" ${this._config.artwork_mode === "hero" ? "selected" : ""}>Hero (Horizontal Landscape)</option>
            ${isGrid ? `
            <option value="logo" ${this._config.artwork_mode === "logo" ? "selected" : ""}>Logo (Transparent Title)</option>
            <option value="icon" ${this._config.artwork_mode === "icon" ? "selected" : ""}>Icon (Small Square)</option>` : ""}
          </select>
          ${!isGrid ? `<div class="helper-text">Logo and Icon aren't offered in Slideshow mode -- their transparent backgrounds can look broken crossfading over the card's own background.</div>` : ""}
        </div>
        <hr>
        <div>
          <div class="section-title">Display Mode</div>
          <div class="radio-group">
            <label><input type="radio" name="display_mode" data-field="display_mode" value="grid" ${isGrid ? "checked" : ""}> Grid</label>
            <label><input type="radio" name="display_mode" data-field="display_mode" value="slideshow" ${!isGrid ? "checked" : ""}> Slideshow</label>
          </div>
        </div>
        ${isGrid ? `
        <div>
          <div class="section-title">Grid Columns</div>
          <select id="grid_columns">
            ${[1, 2, 3, 4].map(n => `<option value="${n}" ${parseInt(this._config.grid_columns) === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="section-title">Rows Before Scrolling</div>
          <input type="number" id="grid_max_rows" value="${parseInt(this._config.grid_max_rows) || 3}" min="1" max="20">
        </div>` : `
        <div>
          <div class="section-title">Time Per Slide (Seconds)</div>
          <input type="number" id="time_per_slide" value="${this._config.time_per_slide}" min="1" step="0.5">
        </div>
        <div>
          <div class="section-title">Transition Fade Time (Seconds)</div>
          <input type="number" id="transition_time" value="${this._config.transition_time}" min="0.1" step="0.1">
        </div>`}
      </div>
    `;

    const fireChanged = () => {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    };

    this.shadowRoot.getElementById("title").addEventListener("change", (ev) => {
      this._config = { ...this._config, title: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("single_entity").addEventListener("change", (ev) => {
      this._config = { ...this._config, single_entity: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("max_games_apply").addEventListener("click", () => {
      const input = this.shadowRoot.getElementById("max_games");
      const clamped = Math.min(50, Math.max(1, parseInt(input.value) || 12));
      input.value = clamped;
      this._config = { ...this._config, max_games: clamped };
      fireChanged();
    });

    this.shadowRoot.getElementById("artwork_mode").addEventListener("change", (ev) => {
      this._config = { ...this._config, artwork_mode: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="display_mode"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        const newMode = ev.target.value;
        // Logo/Icon aren't valid under Slideshow -- reset immediately so
        // the editor's own visible state doesn't lag behind what setConfig
        // would enforce anyway on the next round-trip.
        const needsArtworkReset = newMode === "slideshow" && ["logo", "icon"].includes(this._config.artwork_mode);
        this._config = {
          ...this._config,
          display_mode: newMode,
          artwork_mode: needsArtworkReset ? "cover" : this._config.artwork_mode,
        };
        fireChanged();
        this.render();
      });
    });

    const gridColumns = this.shadowRoot.getElementById("grid_columns");
    if (gridColumns) {
      gridColumns.addEventListener("change", (ev) => {
        this._config = { ...this._config, grid_columns: parseInt(ev.target.value) };
        fireChanged();
      });
    }

    const gridMaxRows = this.shadowRoot.getElementById("grid_max_rows");
    if (gridMaxRows) {
      gridMaxRows.addEventListener("change", (ev) => {
        this._config = { ...this._config, grid_max_rows: Math.max(1, parseInt(ev.target.value) || 3) };
        fireChanged();
      });
    }

    const timePerSlide = this.shadowRoot.getElementById("time_per_slide");
    if (timePerSlide) {
      timePerSlide.addEventListener("change", (ev) => {
        this._config = { ...this._config, time_per_slide: parseFloat(ev.target.value) || 5 };
        fireChanged();
      });
    }

    const transitionTime = this.shadowRoot.getElementById("transition_time");
    if (transitionTime) {
      transitionTime.addEventListener("change", (ev) => {
        this._config = { ...this._config, transition_time: parseFloat(ev.target.value) || 1 };
        fireChanged();
      });
    }

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
        // The PlayStation-only section below depends on this checkbox's
        // state -- re-render so it appears/disappears immediately rather
        // than waiting for some unrelated later change.
        if (field === "show_platform_playstation") this.render();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 12: GAMING STATUS - NEAR COMPLETION
// ====================================================================

class GamingStatusNearCompletionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-near-completion-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      single_entity: "",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
      max_games: 10,
      scroll_after: 10,
      exclude_inactive_months: 0,
      color_palette: "platform",
      custom_colors: "",
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      mode: "single", // see GamingStatusPlaystationTrophiesCard.setConfig for why
      title: config.title || "",
      single_entity: config.single_entity || "",
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
      max_games: config.max_games !== undefined ? Math.min(50, Math.max(1, parseInt(config.max_games) || 10)) : 10,
      scroll_after: config.scroll_after !== undefined ? Math.max(1, parseInt(config.scroll_after) || 10) : 10,
      // 0 = off (default -- no existing config should suddenly start hiding
      // games). 1-12 = exclude anything with no recorded activity in that
      // many months.
      exclude_inactive_months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(parseInt(config.exclude_inactive_months))
        ? parseInt(config.exclude_inactive_months) : 0,
      // "platform" (per-game platform tint, not an index-cycled array) is
      // this card's own default -- deliberately NOT routed through
      // gamingStatusNormalizePalette, which would default to "vivid"
      // instead (fine for the player-leaderboard cards it was built for,
      // but not what this game-leaderboard card should default to).
      color_palette: config.color_palette || "platform",
      custom_colors: config.custom_colors || "",
    };
    this._lastHash = "";
  }

  // Derives sensor.gaming_status_<owner>_library_summary -- same technique
  // as GamingStatusCompletionCard.
  _resolveTargetEntityId(hass) {
    const players = gamingStatusGetPlayerEntities(hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    let playerId = this.config.single_entity;
    if (!playerId || !hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    if (!playerId) return "";
    const libraryEntityId = playerId.replace(/_master$/, "_library_summary");
    return hass.states[libraryEntityId] ? libraryEntityId : "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    const targetEntityId = this._resolveTargetEntityId(hass);
    const stateObj = targetEntityId ? hass.states[targetEntityId] : null;
    const games = stateObj ? (stateObj.attributes.games || []) : null;

    const hash = [
      targetEntityId,
      games ? games.filter(g => (g.percent || 0) < 100).map(g => `${g.title}:${g.platform}:${g.percent}:${g._activity_ts || ""}`).join(",") : "none",
      this.config.max_games,
      this.config.scroll_after,
      this.config.exclude_inactive_months,
      this.config.color_palette,
      this.config.custom_colors,
      [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].join(","),
    ].join("|");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(games === null ? null : this.processData(games));
  }

  // Excludes already-100%-complete games -- those are the dedicated 100%
  // Completion card's job; showing them here too would defeat the point of
  // a "how close am I" list (they'd just permanently occupy the top spot).
  processData(games) {
    let filtered = games
      .filter(g => (g.percent || 0) < 100)
      .filter(g => this.config[`show_platform_${(g.platform || "").toLowerCase()}`] !== false);

    if (this.config.exclude_inactive_months > 0) {
      // _activity_ts is Xbox's last-played timestamp, PSN's last-trophy-
      // earned timestamp, or Steam's last-achievement-earned timestamp (see
      // library_scan.py) -- for PSN/Steam specifically this is "last
      // achievement/trophy earned," not "last played," so a game someone is
      // actively stuck on without progress could still get excluded here --
      // a known, accepted tradeoff of using the only recency signal
      // actually available. A game with no _activity_ts at all (never
      // resolved yet, or genuinely zero achievements ever earned) is left
      // in rather than excluded, since there's no data to judge staleness
      // from.
      const cutoff = Date.now() - this.config.exclude_inactive_months * 30 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(g => {
        if (!g._activity_ts) return true;
        const ts = Date.parse(g._activity_ts);
        return isNaN(ts) || ts >= cutoff;
      });
    }

    return filtered
      .sort((a, b) => (b.percent || 0) - (a.percent || 0))
      .slice(0, this.config.max_games)
      .map(g => ({
        title: g.title || "Unknown",
        platform: g.platform || "",
        percent: g.percent || 0,
      }));
  }

  render(rows) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #nc-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .nc-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
          .nc-list { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
          .nc-list.scrollable { overflow-y: auto; }
        </style>
        <ha-card>
          <div id="nc-title"></div>
          <div id="nc-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("nc-title");
      this._bodyEl = this.shadowRoot.getElementById("nc-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (rows === null) {
      this._bodyEl.innerHTML = `<div class="nc-empty">Near Completion requires Full Game Library Scan to be enabled for at least one platform.</div>`;
      return;
    }
    if (!rows.length) {
      this._bodyEl.innerHTML = `<div class="nc-empty">No in-progress games to display.</div>`;
      return;
    }

    // Same bar-row markup/CSS as GamingStatusLeaderboardCard's non-"longest"
    // metric branch, reused as-is rather than inventing new bar styling.
    const escapeHTML = gamingStatusEscapeHTML;
    const usePlatformColors = this.config.color_palette === "platform";
    const palette = usePlatformColors ? null : gamingStatusResolvePalette(this.config);

    const rowHeight = 24; // bar height; gap below matches the flex container's own 14px gap
    const gap = 14;
    const maxEntries = this.config.scroll_after;
    const needsScroll = rows.length > maxEntries;
    const listStyle = needsScroll
      ? ` style="max-height: ${(rowHeight * maxEntries) + (gap * (maxEntries - 1))}px;"`
      : "";

    let html = `<div class="nc-list${needsScroll ? " scrollable" : ""}"${listStyle}>`;
    rows.forEach((row, index) => {
      let color;
      if (usePlatformColors) {
        const platformLower = row.platform.toLowerCase();
        const tintKey = Object.keys(GAMING_STATUS_PLATFORM_TINTS).find(k => platformLower.includes(k));
        color = tintKey ? `rgb(${GAMING_STATUS_PLATFORM_TINTS[tintKey]})` : "var(--primary-color)";
      } else {
        color = palette[index % palette.length];
      }
      const pct = Math.max(row.percent, 2);
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
          <div style="width: 140px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
            ${escapeHTML(row.title)}
          </div>
          <div style="flex-grow: 1; height: 24px; background: var(--secondary-background-color, rgba(120,120,120,0.2)); position: relative; overflow: hidden; border-radius: 0;">
            <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 0; transition: width 0.5s ease-out;"></div>
          </div>
          <div style="min-width: 40px; flex-shrink: 0; text-align: right; font-size: 14px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap;">
            ${row.percent}%
          </div>
        </div>
      `;
    });
    html += `</div>`;
    this._bodyEl.innerHTML = html;
  }

  getCardSize() { return 4; }
}

class GamingStatusNearCompletionEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const completionPlatforms = ["steam", "xbox", "playstation"];
    const isCustom = this._config.color_palette === "custom";

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], input[type="number"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
        .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
        label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        hr { border: 0; border-top: 1px solid var(--divider-color); margin: 0; }
        .helper-text { font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px; line-height: 1.4; }
        .inline-apply { display: flex; gap: 8px; align-items: center; }
        .inline-apply input { flex: 1; }
        .inline-apply button { padding: 8px 14px; background: var(--primary-color); color: var(--text-primary-color, #fff); border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .inline-apply button:hover { opacity: 0.9; }
      </style>
      <div class="editor-container">
        <div>
          <div class="section-title">Card Title (Optional)</div>
          <input type="text" id="title" value="${this._esc(this._config.title || "")}">
        </div>
        <hr>
        <div>
          <div class="section-title">Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only include in-progress games from the checked platforms.</div>
          <div class="checkbox-group">
            ${completionPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Max Games to Display</div>
          <div class="inline-apply">
            <input type="number" id="max_games" value="${parseInt(this._config.max_games) || 10}" min="1" max="50">
            <button type="button" id="max_games_apply">Apply</button>
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Scroll After (Entries)</div>
          <input type="number" id="scroll_after" value="${parseInt(this._config.scroll_after) || 10}" min="1" max="50">
        </div>
        <hr>
        <div>
          <div class="section-title">Exclude Games Inactive For</div>
          <div class="helper-text">Based on each game's last recorded activity: Xbox uses last time played, while PlayStation and Steam use last achievement/trophy earned instead (neither API exposes a separate "last played" signal) -- so a game you're actively playing without making progress can still get excluded on those two platforms. A game with no recorded activity at all is never excluded.</div>
          <select id="exclude_inactive_months">
            <option value="0" ${parseInt(this._config.exclude_inactive_months) === 0 ? "selected" : ""}>Never (Show All)</option>
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${parseInt(this._config.exclude_inactive_months) === m ? "selected" : ""}>${m} Month${m === 1 ? "" : "s"}</option>`).join("")}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Bar Color</div>
          <select id="color_palette">
            <option value="platform" ${this._config.color_palette === "platform" ? "selected" : ""}>Platform Colors (Default)</option>
            ${gamingStatusPaletteOptionsHTML(this._config.color_palette)}
          </select>
        </div>
        ${isCustom ? `
        <div>
          <div class="section-title">Custom Colors</div>
          <div class="helper-text">Comma-separated hex colors, e.g. #FFBE0B, #FB5607</div>
          <input type="text" id="custom_colors" value="${this._esc(this._config.custom_colors || "")}">
        </div>` : ""}
      </div>
    `;

    const fireChanged = () => {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    };

    this.shadowRoot.getElementById("title").addEventListener("change", (ev) => {
      this._config = { ...this._config, title: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("single_entity").addEventListener("change", (ev) => {
      this._config = { ...this._config, single_entity: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("max_games_apply").addEventListener("click", () => {
      const input = this.shadowRoot.getElementById("max_games");
      const clamped = Math.min(50, Math.max(1, parseInt(input.value) || 10));
      input.value = clamped;
      this._config = { ...this._config, max_games: clamped };
      fireChanged();
    });

    this.shadowRoot.getElementById("scroll_after").addEventListener("change", (ev) => {
      this._config = { ...this._config, scroll_after: Math.max(1, parseInt(ev.target.value) || 10) };
      fireChanged();
    });

    this.shadowRoot.getElementById("exclude_inactive_months").addEventListener("change", (ev) => {
      this._config = { ...this._config, exclude_inactive_months: parseInt(ev.target.value) || 0 };
      fireChanged();
    });

    this.shadowRoot.getElementById("color_palette").addEventListener("change", (ev) => {
      this._config = { ...this._config, color_palette: ev.target.value };
      fireChanged();
      this.render();
    });

    const customColors = this.shadowRoot.getElementById("custom_colors");
    if (customColors) {
      customColors.addEventListener("change", (ev) => {
        this._config = { ...this._config, custom_colors: ev.target.value };
        fireChanged();
      });
    }

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 13: GAMING STATUS - STATS
// ====================================================================

// Ordered list of every stat this card can show -- same order used for both
// the editor's checkboxes and the card's own 2-column grid, so toggling one
// on/off doesn't reshuffle the rest.
const GAMING_STATUS_STAT_KEYS = [
  "games_tracked", "avg_completion", "total_gamerscore", "total_trophies",
  "platinum_trophies", "gold_trophies", "silver_trophies", "bronze_trophies",
  "steam_achievements", "total_steam_hours",
];
const GAMING_STATUS_STAT_LABELS = {
  games_tracked: "Games Tracked",
  avg_completion: "Average Completion",
  total_gamerscore: "Total Gamerscore",
  total_trophies: "Total Trophies",
  platinum_trophies: "Platinum Trophies",
  gold_trophies: "Gold Trophies",
  silver_trophies: "Silver Trophies",
  bronze_trophies: "Bronze Trophies",
  steam_achievements: "Steam Achievements",
  total_steam_hours: "Total Steam Hours",
};

class GamingStatusStatsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-stats-editor");
  }

  static getStubConfig() {
    const config = {
      title: "",
      single_entity: "",
      show_platform_steam: true,
      show_platform_xbox: true,
      show_platform_playstation: true,
    };
    GAMING_STATUS_STAT_KEYS.forEach(key => { config[`show_stat_${key}`] = true; });
    return config;
  }

  setConfig(config) {
    this.config = {
      ...config,
      mode: "single", // see GamingStatusPlaystationTrophiesCard.setConfig for why
      title: config.title || "",
      single_entity: config.single_entity || "",
      show_platform_steam: config.show_platform_steam !== false,
      show_platform_xbox: config.show_platform_xbox !== false,
      show_platform_playstation: config.show_platform_playstation !== false,
    };
    GAMING_STATUS_STAT_KEYS.forEach(key => {
      this.config[`show_stat_${key}`] = config[`show_stat_${key}`] !== false;
    });
    this._lastHash = "";
  }

  // Derives sensor.gaming_status_<owner>_library_summary -- same technique
  // as GamingStatusCompletionCard.
  _resolveTargetEntityId(hass) {
    const players = gamingStatusGetPlayerEntities(hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    let playerId = this.config.single_entity;
    if (!playerId || !hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    if (!playerId) return "";
    const libraryEntityId = playerId.replace(/_master$/, "_library_summary");
    return hass.states[libraryEntityId] ? libraryEntityId : "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    const targetEntityId = this._resolveTargetEntityId(hass);
    const stateObj = targetEntityId ? hass.states[targetEntityId] : null;
    const games = stateObj ? (stateObj.attributes.games || []) : null;

    const hash = [
      targetEntityId,
      stateObj ? stateObj.last_updated : "",
      GAMING_STATUS_STAT_KEYS.map(key => this.config[`show_stat_${key}`]).join(","),
      [this.config.show_platform_steam, this.config.show_platform_xbox, this.config.show_platform_playstation].join(","),
    ].join("|");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(games === null ? null : this.computeStats(games));
  }

  // Derived entirely client-side from the platform-filtered game list --
  // never from library_summary's own pre-aggregated totals directly, since
  // those are computed across ALL platforms regardless of this card's own
  // checkboxes (unchecking Steam here must remove Steam's contribution).
  computeStats(games) {
    const filtered = games.filter(g => this.config[`show_platform_${(g.platform || "").toLowerCase()}`] !== false);
    const xboxGames = filtered.filter(g => g.platform === "xbox");
    const psGames = filtered.filter(g => g.platform === "playstation");
    const steamGames = filtered.filter(g => g.platform === "steam");

    const sum = (arr, key) => arr.reduce((s, g) => s + (g[key] || 0), 0);
    const sumTier = (arr, tier) => arr.reduce((s, g) => s + ((g.trophies_earned || {})[tier] || 0), 0);
    const sumTierTotal = (arr, tier) => arr.reduce((s, g) => s + ((g.trophies_total || {})[tier] || 0), 0);

    const gamerscoreEarned = sum(xboxGames, "gamerscore_earned");
    const gamerscoreTotal = sum(xboxGames, "gamerscore_total");

    const tierKeys = ["bronze", "silver", "gold", "platinum"];
    const trophyEarned = {};
    const trophyTotal = {};
    tierKeys.forEach(t => {
      trophyEarned[t] = sumTier(psGames, t);
      trophyTotal[t] = sumTierTotal(psGames, t);
    });
    const totalTrophiesEarned = tierKeys.reduce((s, t) => s + trophyEarned[t], 0);
    const totalTrophiesTotal = tierKeys.reduce((s, t) => s + trophyTotal[t], 0);

    const steamAchEarned = sum(steamGames, "achievements_earned");
    const steamAchTotal = sum(steamGames, "achievements_total");
    const steamHours = sum(steamGames, "playtime_hours");

    const avgCompletion = filtered.length ? filtered.reduce((s, g) => s + (g.percent || 0), 0) / filtered.length : 0;

    return {
      games_tracked: `${filtered.length}`,
      avg_completion: `${Math.round(avgCompletion * 10) / 10}%`,
      total_gamerscore: `${gamerscoreEarned} / ${gamerscoreTotal}`,
      total_trophies: `${totalTrophiesEarned} / ${totalTrophiesTotal}`,
      platinum_trophies: `${trophyEarned.platinum} / ${trophyTotal.platinum}`,
      gold_trophies: `${trophyEarned.gold} / ${trophyTotal.gold}`,
      silver_trophies: `${trophyEarned.silver} / ${trophyTotal.silver}`,
      bronze_trophies: `${trophyEarned.bronze} / ${trophyTotal.bronze}`,
      steam_achievements: `${steamAchEarned} / ${steamAchTotal}`,
      total_steam_hours: `${Math.round(steamHours * 10) / 10}h`,
    };
  }

  render(stats) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #st-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          .st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
          .st-label { font-size: 14px; color: var(--primary-text-color); }
          .st-value { font-size: 15px; font-weight: 600; color: var(--primary-text-color); text-align: right; }
          .st-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="st-title"></div>
          <div id="st-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("st-title");
      this._bodyEl = this.shadowRoot.getElementById("st-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (stats === null) {
      this._bodyEl.innerHTML = `<div class="st-empty">Stats requires Full Game Library Scan to be enabled for at least one platform.</div>`;
      return;
    }

    const escapeHTML = gamingStatusEscapeHTML;
    const visibleKeys = GAMING_STATUS_STAT_KEYS.filter(key => this.config[`show_stat_${key}`] !== false);
    if (!visibleKeys.length) {
      this._bodyEl.innerHTML = `<div class="st-empty">No stats selected.</div>`;
      return;
    }

    this._bodyEl.innerHTML = `<div class="st-grid">` +
      visibleKeys.map(key => `
        <div class="st-label">${escapeHTML(GAMING_STATUS_STAT_LABELS[key])}</div>
        <div class="st-value">${escapeHTML(stats[key])}</div>`).join("") +
      `</div>`;
  }
}

class GamingStatusStatsEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const statsPlatforms = ["steam", "xbox", "playstation"];

    this.shadowRoot.innerHTML = `
      <style>
        .editor-container { display: flex; flex-direction: column; gap: 20px; color: var(--primary-text-color); }
        .section-title { font-weight: 600; margin-bottom: 8px; }
        input[type="text"], select { width: 100%; padding: 8px; background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; box-sizing: border-box; }
        input:focus, select:focus { outline: none; border-color: var(--primary-color); }
        .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
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
          <div class="section-title">Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Platforms</div>
          <div class="helper-text">Only include stats from the checked platforms.</div>
          <div class="checkbox-group">
            ${statsPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="checkbox" data-field="show_platform_${key}" ${this._config[`show_platform_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
        </div>
        <hr>
        <div>
          <div class="section-title">Stats to Display</div>
          <div class="checkbox-group">
            ${GAMING_STATUS_STAT_KEYS.map(key => `<label><input type="checkbox" data-field="show_stat_${key}" ${this._config[`show_stat_${key}`] !== false ? "checked" : ""}> ${GAMING_STATUS_STAT_LABELS[key]}</label>`).join("")}
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

    this.shadowRoot.getElementById("single_entity").addEventListener("change", (ev) => {
      this._config = { ...this._config, single_entity: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
  }
}

// ====================================================================
// CARD 14: GAMING STATUS - LIBRARY
// ====================================================================

class GamingStatusLibraryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static getConfigElement() {
    return document.createElement("gaming-status-library-editor");
  }

  // width is only used for non-hero (left-aligned thumbnail) modes; hero art
  // always spans the row's full width instead. rowHeight is a best-effort
  // fixed budget for the scroll-cap math (same "typical content" assumption
  // every other scrollable list in this bundle already makes) -- generous
  // enough for title + percent + one counts line (PS's counts line is the
  // same single-line shape, just with all 4 tiers in it).
  static ARTWORK_THUMB = {
    cover: { width: 60, height: 90, rowHeight: 110 },
    hero: { width: null, height: 80, rowHeight: 190 },
    logo: { width: 100, height: 50, rowHeight: 100 },
    icon: { width: 60, height: 60, rowHeight: 100 },
  };

  static getStubConfig() {
    return {
      title: "",
      single_entity: "",
      platform: "steam",
      exclude_zero_completion: false,
      artwork_mode: "cover",
      scroll_after: 4,
      show_total: true,
      show_field_title: true,
      show_field_percent: true,
      show_field_counts: true,
    };
  }

  setConfig(config) {
    this.config = {
      ...config,
      mode: "single", // see GamingStatusPlaystationTrophiesCard.setConfig for why
      title: config.title || "",
      single_entity: config.single_entity || "",
      platform: ["steam", "xbox", "playstation"].includes(config.platform) ? config.platform : "steam",
      exclude_zero_completion: config.exclude_zero_completion === true,
      artwork_mode: ["cover", "hero", "logo", "icon"].includes(config.artwork_mode) ? config.artwork_mode : "cover",
      scroll_after: config.scroll_after !== undefined ? Math.max(1, parseInt(config.scroll_after) || 4) : 4,
      show_total: config.show_total !== false,
      show_field_title: config.show_field_title !== false,
      show_field_percent: config.show_field_percent !== false,
      show_field_counts: config.show_field_counts !== false,
    };
    this._lastHash = "";
  }

  // Derives sensor.gaming_status_<owner>_library_summary -- same technique
  // as GamingStatusCompletionCard.
  _resolveTargetEntityId(hass) {
    const players = gamingStatusGetPlayerEntities(hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    let playerId = this.config.single_entity;
    if (!playerId || !hass.states[playerId]) {
      playerId = players.length ? players[0].id : "";
    }
    if (!playerId) return "";
    const libraryEntityId = playerId.replace(/_master$/, "_library_summary");
    return hass.states[libraryEntityId] ? libraryEntityId : "";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;

    const targetEntityId = this._resolveTargetEntityId(hass);
    const stateObj = targetEntityId ? hass.states[targetEntityId] : null;
    const games = stateObj ? (stateObj.attributes.games || []) : null;

    const hash = [
      targetEntityId,
      games ? games.filter(g => g.platform === this.config.platform).map(g => `${g.title}:${g.percent}`).join(",") : "none",
      this.config.platform,
      this.config.exclude_zero_completion,
      this.config.artwork_mode,
      this.config.scroll_after,
      this.config.show_total,
      this.config.show_field_title,
      this.config.show_field_percent,
      this.config.show_field_counts,
    ].join("|");

    if (this._lastHash === hash) return;
    this._lastHash = hash;

    this.render(games === null ? null : this.processData(games));
  }

  processData(games) {
    return games
      .filter(g => g.platform === this.config.platform)
      .filter(g => !this.config.exclude_zero_completion || (g.percent || 0) > 0)
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }

  _artFor(g) {
    const fieldByMode = { cover: "game_cover_art", hero: "game_hero_art", logo: "game_logo_art", icon: "game_icon_art" };
    const primary = g[fieldByMode[this.config.artwork_mode]];
    return primary || g.game_cover_art || g.game_hero_art || "";
  }

  render(games) {
    if (!this.content) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { padding: 16px; border-radius: var(--ha-card-border-radius, 12px); background: var(--ha-card-background, var(--card-background-color, #1e1e1e)); box-sizing: border-box; }
          #lb-title { font-size: 20px; font-weight: 400; letter-spacing: -0.012em; line-height: 32px; color: var(--ha-card-header-color, var(--primary-text-color)); padding-bottom: 12px; display: none; }
          #lb-total { font-size: 13px; color: var(--secondary-text-color); padding-bottom: 8px; }
          .lb-list { display: flex; flex-direction: column; gap: 8px; }
          .lb-list.scrollable { overflow-y: auto; }
          .lb-row { display: flex; gap: 10px; border-radius: 8px; overflow: hidden; background: var(--secondary-background-color, rgba(120, 120, 120, 0.08)); padding: 8px; box-sizing: border-box; }
          .lb-row.hero-layout { flex-direction: column; }
          .lb-art { object-fit: contain; flex-shrink: 0; display: block; }
          .lb-art-placeholder { border-radius: 4px; background: rgba(120, 120, 120, 0.12); }
          .lb-data { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; }
          .lb-title-text { font-size: 14px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .lb-line { font-size: 12px; color: var(--secondary-text-color); }
          .lb-empty { padding: 20px; color: var(--secondary-text-color); font-style: italic; }
        </style>
        <ha-card>
          <div id="lb-title"></div>
          <div id="lb-total"></div>
          <div id="lb-body"></div>
        </ha-card>
      `;
      this._titleEl = this.shadowRoot.getElementById("lb-title");
      this._totalEl = this.shadowRoot.getElementById("lb-total");
      this._bodyEl = this.shadowRoot.getElementById("lb-body");
      this.content = this._bodyEl;
    }

    this._titleEl.textContent = this.config.title || "";
    this._titleEl.style.display = this.config.title ? "block" : "none";

    if (games === null) {
      this._totalEl.style.display = "none";
      this._bodyEl.innerHTML = `<div class="lb-empty">Library requires Full Game Library Scan to be enabled for this platform.</div>`;
      return;
    }

    if (this.config.show_total) {
      this._totalEl.style.display = "block";
      this._totalEl.textContent = `${games.length} game${games.length === 1 ? "" : "s"}`;
    } else {
      this._totalEl.style.display = "none";
    }

    if (!games.length) {
      this._bodyEl.innerHTML = `<div class="lb-empty">No games to display.</div>`;
      return;
    }

    const escapeHTML = gamingStatusEscapeHTML;
    const mode = this.config.artwork_mode;
    const thumb = GamingStatusLibraryCard.ARTWORK_THUMB[mode];
    const isHero = mode === "hero";
    const gap = 8;
    const maxEntries = this.config.scroll_after;
    const needsScroll = games.length > maxEntries;

    let listStyle = "";
    if (needsScroll) {
      listStyle = ` style="max-height: ${(thumb.rowHeight * maxEntries) + (gap * (maxEntries - 1))}px;"`;
    }

    this._bodyEl.innerHTML = `<div class="lb-list${needsScroll ? " scrollable" : ""}"${listStyle}>` +
      games.map(g => {
        const art = this._artFor(g);
        // Hero art scales to the row's full width at its own natural aspect
        // ratio (no fixed height/object-fit) rather than being boxed into a
        // fixed-height crop -- unlike the left-aligned thumbnail modes,
        // where a fixed box keeps every row the same height.
        const imgStyle = isHero
          ? `width: 100%; height: auto;`
          : `width: ${thumb.width}px; height: ${thumb.height}px;`;
        // A missing-art placeholder keeps the same box size art would have
        // occupied, so rows without art don't shift their text left/up to
        // fill the gap -- hero mode has no intrinsic image height to fall
        // back on (height: auto depends on the image loading), so its
        // placeholder pins to the thumb's nominal height instead.
        const imgHtml = art
          ? `<img class="lb-art" src="${escapeHTML(art)}" alt="" loading="lazy" style="${imgStyle}">`
          : `<div class="lb-art lb-art-placeholder" style="${isHero ? `width: 100%; height: ${thumb.height}px;` : imgStyle}"></div>`;

        const lines = [];
        if (this.config.show_field_title) {
          // Console (e.g. "PS4") rides along on the title, same as the
          // tooltip/column treatment elsewhere -- only ever set for a
          // genuinely single-console PSN title, never a cross-buy release
          // spanning multiple platforms (see library_scan.py's _scan_psn).
          const titleText = g.console ? `${g.title || "Unknown"} (${g.console})` : (g.title || "Unknown");
          lines.push(`<div class="lb-title-text">${escapeHTML(titleText)}</div>`);
        }
        if (this.config.show_field_percent) lines.push(`<div class="lb-line">${Math.round((g.percent || 0) * 10) / 10}%</div>`);
        if (this.config.show_field_counts) {
          if (this.config.platform === "playstation") {
            const earned = g.trophies_earned || {};
            const total = g.trophies_total || {};
            // All 4 tiers on one line -- unlike Steam/Xbox, which only ever
            // have a single "Achievements: X / Y" line to show here.
            const tierText = ["bronze", "silver", "gold", "platinum"]
              .map(tier => `${tier.charAt(0).toUpperCase() + tier.slice(1)}: ${earned[tier] || 0}/${total[tier] || 0}`)
              .join(" | ");
            lines.push(`<div class="lb-line">${tierText}</div>`);
          } else {
            lines.push(`<div class="lb-line">Achievements: ${g.achievements_earned || 0} / ${g.achievements_total || 0}</div>`);
          }
        }

        return `
          <div class="lb-row${isHero ? " hero-layout" : ""}" style="min-height: ${thumb.rowHeight - 16}px;">
            ${imgHtml}
            <div class="lb-data">${lines.join("")}</div>
          </div>`;
      }).join("") +
      `</div>`;
  }
}

class GamingStatusLibraryEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    if (this._config && this.shadowRoot.firstChild && JSON.stringify(this._config) === JSON.stringify(config)) {
      this._config = config;
      return;
    }
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
    const playerEntities = gamingStatusGetPlayerEntities(this._hass, GAMING_STATUS_DEFAULT_ENTITIES_PATTERN);
    if (gamingStatusDefaultSingleEntity(this._config, playerEntities)) {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    const effectiveSingleEntity = gamingStatusEffectiveSingleEntity(this._config, playerEntities);
    const entityOptions = gamingStatusPlayerOptionsHTML(playerEntities, effectiveSingleEntity, (s) => this._esc(s));
    const availablePlatforms = gamingStatusGetAvailablePlatforms(this._hass);
    const libraryPlatforms = ["steam", "xbox", "playstation"];
    const isPS = this._config.platform === "playstation";

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
          <div class="section-title">Player</div>
          <select id="single_entity">
            <option value="" disabled ${!effectiveSingleEntity ? "selected" : ""}>Select a player…</option>
            ${entityOptions}
          </select>
        </div>
        <hr>
        <div>
          <div class="section-title">Platform</div>
          <div class="radio-group">
            ${libraryPlatforms
              .filter(key => !availablePlatforms || availablePlatforms.has(key))
              .map(key => `<label><input type="radio" name="platform" data-field="platform" value="${key}" ${this._config.platform === key ? "checked" : ""}> ${GAMING_STATUS_PLATFORM_LABELS[key]}</label>`).join("")}
          </div>
        </div>
        <hr>
        <div>
          <label><input type="checkbox" data-field="exclude_zero_completion" ${this._config.exclude_zero_completion ? "checked" : ""}> Exclude Games With Zero Completion</label>
        </div>
        <hr>
        <div>
          <div class="section-title">Artwork</div>
          <select id="artwork_mode">
            <option value="cover" ${this._config.artwork_mode === "cover" ? "selected" : ""}>Cover/Grid (Vertical Portrait)</option>
            <option value="hero" ${this._config.artwork_mode === "hero" ? "selected" : ""}>Hero (Horizontal Landscape)</option>
            <option value="logo" ${this._config.artwork_mode === "logo" ? "selected" : ""}>Logo (Transparent Title)</option>
            <option value="icon" ${this._config.artwork_mode === "icon" ? "selected" : ""}>Icon (Small Square)</option>
          </select>
          <div class="helper-text">Hero artwork displays above each game's data instead of to the left, since it doesn't suit a narrow thumbnail.</div>
        </div>
        <hr>
        <div>
          <div class="section-title">Scroll After (Entries)</div>
          <input type="number" id="scroll_after" value="${parseInt(this._config.scroll_after) || 4}" min="1" max="50">
        </div>
        <hr>
        <div>
          <label><input type="checkbox" data-field="show_total" ${this._config.show_total !== false ? "checked" : ""}> Show Total</label>
        </div>
        <hr>
        <div>
          <div class="section-title">Fields to Display</div>
          <div class="checkbox-group">
            <label><input type="checkbox" data-field="show_field_title" ${this._config.show_field_title !== false ? "checked" : ""}> Title</label>
            <label><input type="checkbox" data-field="show_field_percent" ${this._config.show_field_percent !== false ? "checked" : ""}> Completion Percentage</label>
            <label><input type="checkbox" data-field="show_field_counts" ${this._config.show_field_counts !== false ? "checked" : ""}> ${isPS ? "Trophy Counts" : "Achievement Count"}</label>
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

    this.shadowRoot.getElementById("single_entity").addEventListener("change", (ev) => {
      this._config = { ...this._config, single_entity: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[name="platform"]').forEach((radio) => {
      radio.addEventListener("change", (ev) => {
        this._config = { ...this._config, platform: ev.target.value };
        fireChanged();
        this.render();
      });
    });

    this.shadowRoot.getElementById("artwork_mode").addEventListener("change", (ev) => {
      this._config = { ...this._config, artwork_mode: ev.target.value };
      fireChanged();
    });

    this.shadowRoot.getElementById("scroll_after").addEventListener("change", (ev) => {
      this._config = { ...this._config, scroll_after: Math.max(1, parseInt(ev.target.value) || 4) };
      fireChanged();
    });

    this.shadowRoot.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (ev) => {
        const field = ev.target.dataset.field;
        this._config = { ...this._config, [field]: ev.target.checked };
        fireChanged();
      });
    });
  }

  _esc(s) {
    return gamingStatusEscapeHTML(s);
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

// Card 7B
customElements.define("gaming-status-recent-achievements-card", GamingStatusRecentAchievementsCard);
customElements.define("gaming-status-recent-achievements-editor", GamingStatusRecentAchievementsEditor);

// Card 8
customElements.define("gaming-status-game-management-card", GamingStatusGameManagementCard);
customElements.define("gaming-status-game-management-editor", GamingStatusGameManagementEditor);

// Card 9
customElements.define("gaming-status-achievement-icons-card", GamingStatusAchievementIconsCard);
customElements.define("gaming-status-achievement-icons-editor", GamingStatusAchievementIconsEditor);

// Card 10
customElements.define("gaming-status-playstation-trophies-card", GamingStatusPlaystationTrophiesCard);
customElements.define("gaming-status-playstation-trophies-editor", GamingStatusPlaystationTrophiesEditor);

// Card 11
customElements.define("gaming-status-completion-card", GamingStatusCompletionCard);
customElements.define("gaming-status-completion-editor", GamingStatusCompletionEditor);

// Card 12
customElements.define("gaming-status-near-completion-card", GamingStatusNearCompletionCard);
customElements.define("gaming-status-near-completion-editor", GamingStatusNearCompletionEditor);

// Card 13
customElements.define("gaming-status-stats-card", GamingStatusStatsCard);
customElements.define("gaming-status-stats-editor", GamingStatusStatsEditor);

// Card 14
customElements.define("gaming-status-library-card", GamingStatusLibraryCard);
customElements.define("gaming-status-library-editor", GamingStatusLibraryEditor);

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

window.customCards.push({
  type: "gaming-status-recent-achievements-card",
  name: "Gaming Status - Recent Achievements",
  preview: true,
  description: "A configurable table of recently unlocked achievements/trophies with optional blurred artwork backgrounds."
});

window.customCards.push({
  type: "gaming-status-game-management-card",
  name: "Gaming Status - Game Management",
  preview: true,
  description: "Rename or permanently delete a game from a player's stored play history."
});

window.customCards.push({
  type: "gaming-status-achievement-icons-card",
  name: "Gaming Status - Achievement Icons",
  preview: true,
  description: "A compact grid of the most recently unlocked achievement/trophy icons, with hover detail."
});

window.customCards.push({
  type: "gaming-status-playstation-trophies-card",
  name: "Gaming Status - PlayStation Trophies",
  preview: true,
  description: "A single player's lifetime Bronze/Silver/Gold/Platinum trophy totals."
});

window.customCards.push({
  type: "gaming-status-completion-card",
  name: "Gaming Status - 100% Completion",
  preview: true,
  description: "Cover art for a single player's fully-completed games, as a slideshow or grid."
});

window.customCards.push({
  type: "gaming-status-near-completion-card",
  name: "Gaming Status - Near Completion",
  preview: true,
  description: "A leaderboard-style list of a single player's games ranked by how close they are to 100%."
});

window.customCards.push({
  type: "gaming-status-stats-card",
  name: "Gaming Status - Stats",
  preview: true,
  description: "A configurable two-column summary of a single player's completion/trophy/achievement stats."
});

window.customCards.push({
  type: "gaming-status-library-card",
  name: "Gaming Status - Library",
  preview: true,
  description: "A scrollable, artwork-and-stats list of a single player's game library for one platform."
});