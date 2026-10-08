import { div, element, p, span, ul, li } from "../../src/index.js";

/** @param {import('./game.js').GameContext} context @param {import('../../src/index.js').KeyboardHandler | null} [onKey] */
export function arenaView({ bind, derive, keyed }, onKey = null) {
  return div(
    div(
      {
        class: "arena",
        ...(onKey
          ? {
              id: "live-arena",
              tabIndex: 0,
              onKey,
              "aria-label":
                "Live arena. Arrow keys or WASD to move, Space to dash, E to emote.",
            }
          : { "aria-label": "Recorded arena" }),
      },
      div({ class: "arena-label" }, "COIN RUN / SECTOR 04"),
      keyed(
        bind.coins,
        (coin) => coin.id,
        (row) =>
          div({
            class: "coin",
            "data-coin": row.key,
            style: {
              left: row.derive(() => `${row.value.x}%`),
              top: row.derive(() => `${row.value.y}%`),
            },
            "aria-label": "Coin",
          }),
      ),
      keyed(
        bind.players,
        (player) => player.id,
        (row) =>
          div(
            {
              class: {
                player: true,
                dashing: row.derive(
                  (state) =>
                    state.tick <= row.value.dashUntil && state.tick > 0,
                ),
              },
              "data-player": row.key,
              style: {
                left: row.derive(() => `${row.value.x}%`),
                top: row.derive(() => `${row.value.y}%`),
                "--player-color": row.item.color,
              },
              "aria-label": row.derive(
                () =>
                  `${row.value.name}, x ${row.value.x}, y ${row.value.y}, score ${row.value.score}`,
              ),
            },
            span(
              { class: "emote", hidden: row.derive(() => !row.value.emote) },
              row.item.emote,
            ),
            div(
              { class: "avatar" },
              row.derive(() => row.value.name.slice(0, 1)),
            ),
            span({ class: "player-name" }, row.item.name),
          ),
      ),
    ),
    p(
      { class: "match-stats" },
      span({ class: "tick-label" }, "TICK ", bind.tick),
      span(derive((state) => `${(state.time / 1_000_000).toFixed(1)} s`)),
      span(bind.commands, " player commands"),
    ),
    div(
      { class: "scoreboard" },
      keyed(
        bind.players,
        (player) => player.id,
        (row) =>
          div(
            { class: "score", style: { "--player-color": row.item.color } },
            span({ class: "score-name" }, row.item.name),
            element("strong", { "data-score": row.key }, row.item.score),
          ),
      ),
    ),
    ul(
      { class: "event-feed", "aria-label": "Recent match events" },
      keyed(
        bind.events,
        (event) => event.id,
        (row) =>
          li(
            span(
              { class: "event-tick" },
              row.derive(() => `${(row.value.tick / 10).toFixed(1)}s`),
            ),
            row.item.text,
          ),
      ),
    ),
  );
}
