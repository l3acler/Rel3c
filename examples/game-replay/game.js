import { createApp, createActionSchema } from "../../src/index.js";

export const TICK_DURATION = 100_000;
export const MATCH_TICKS = 120;
export const simulation = {
  tickDuration: TICK_DURATION,
  action: /** @type {const} */ ("tick"),
  maxCatchUp: 4,
};
/** @typedef {{id:number,name:string,color:string,x:number,y:number,dx:number,dy:number,score:number,dashUntil:number,emote:string,emoteUntil:number}} Player */
/** @typedef {{id:number,x:number,y:number}} Coin */
/** @typedef {{id:number,tick:number,text:string}} MatchEvent */
/** @typedef {{tick:number,time:number,finished:boolean,commands:number,nextEvent:number,players:Player[],coins:Coin[],events:MatchEvent[]}} GameState */
/** @typedef {{id:number,dx:number,dy:number}} Direction */

/** @returns {GameState} */
export function initialState() {
  return {
    tick: 0,
    time: 0,
    finished: false,
    commands: 0,
    nextEvent: 1,
    players: [
      { id: 1, name: "You", color: "#77e4c8", x: 18, y: 50 },
      { id: 2, name: "Iris", color: "#ad9dff", x: 78, y: 22 },
      { id: 3, name: "Kai", color: "#ffb575", x: 70, y: 75 },
      { id: 4, name: "Milo", color: "#83baff", x: 38, y: 82 },
    ].map((player) => ({
      ...player,
      dx: 0,
      dy: 0,
      score: 0,
      dashUntil: 0,
      emote: "",
      emoteUntil: 0,
    })),
    coins: [
      [25, 25],
      [52, 44],
      [82, 65],
      [45, 73],
      [68, 34],
      [15, 78],
    ].map(([x, y], index) => ({ id: index + 1, x: x ?? 50, y: y ?? 50 })),
    events: [],
  };
}
/** @param {unknown} value @returns {value is number} */
const playerId = (value) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 4;
/** @param {unknown} value @returns {value is Direction} */
const direction = (value) =>
  value !== null &&
  typeof value === "object" &&
  "id" in value &&
  playerId(value.id) &&
  "dx" in value &&
  "dy" in value &&
  typeof value.dx === "number" &&
  [-1, 0, 1].includes(value.dx) &&
  typeof value.dy === "number" &&
  [-1, 0, 1].includes(value.dy);
/** @param {number} value */
const bound = (value) =>
  Math.round(Math.max(4, Math.min(96, value)) * 100) / 100;
/** @param {GameState} state @param {string} text */
function log(state, text) {
  state.events.push({ id: state.nextEvent++, tick: state.tick, text });
  if (state.events.length > 6) state.events.shift();
}
/** @param {GameState} state @param {Player} player */
function dash(state, player) {
  player.dashUntil = state.tick + 3;
  log(state, `${player.name} dashed`);
}
/** @param {GameState} state @param {Player} player @param {string} text */
function emote(state, player, text) {
  player.emote = text;
  player.emoteUntil = state.tick + 16;
  log(state, `${player.name}: ${text}`);
}

/** @type {typeof createActionSchema<GameState>} */
const createSchema = createActionSchema;
export const schema = createSchema({ version: "replay-arena/1" })(
  ({ action }) => ({
    direction: action(direction, (draft, input) => {
      if (draft.finished) return;
      const player = draft.players.find((player) => player.id === input.id);
      if (player) {
        player.dx = input.dx;
        player.dy = input.dy;
        draft.commands++;
      }
    }),
    nudge: action(direction, (draft, input) => {
      if (draft.finished) return;
      const player = draft.players.find((player) => player.id === input.id);
      if (player) {
        player.x = bound(player.x + input.dx * 4);
        player.y = bound(player.y + input.dy * 4);
        draft.commands++;
      }
    }),
    dash: action(playerId, (draft, id) => {
      if (draft.finished) return;
      const player = draft.players.find((player) => player.id === id);
      if (player) {
        dash(draft, player);
        draft.commands++;
      }
    }),
    emote: action(playerId, (draft, id) => {
      if (draft.finished) return;
      const player = draft.players.find((player) => player.id === id);
      if (player) {
        emote(draft, player, "Hello!");
        draft.commands++;
      }
    }),
    tick: action((draft, services) => {
      if (draft.finished) return;
      draft.tick++;
      draft.time = services.now();
      for (const player of draft.players) {
        if (player.id !== 1) {
          const target = draft.coins.reduce((nearest, coin) =>
            Math.hypot(coin.x - player.x, coin.y - player.y) <
            Math.hypot(nearest.x - player.x, nearest.y - player.y)
              ? coin
              : nearest,
          );
          player.dx = Math.sign(target.x - player.x);
          player.dy = Math.sign(target.y - player.y);
          if (draft.tick % 17 === 0 && services.random() < 0.5)
            dash(draft, player);
          if (draft.tick % 20 === 0 && services.random() < 0.5)
            emote(draft, player, services.random() < 0.5 ? "Nice!" : "GG!");
        }
        const speed = draft.tick <= player.dashUntil ? 5 : 1.8;
        const diagonal = player.dx && player.dy ? Math.SQRT2 : 1;
        player.x = bound(player.x + (player.dx * speed) / diagonal);
        player.y = bound(player.y + (player.dy * speed) / diagonal);
        for (const coin of draft.coins) {
          if (Math.hypot(coin.x - player.x, coin.y - player.y) >= 4) continue;
          player.score++;
          log(draft, `${player.name} collected a coin`);
          coin.x = 8 + Math.floor(services.random() * 85);
          coin.y = 8 + Math.floor(services.random() * 85);
        }
        if (draft.tick >= player.emoteUntil) player.emote = "";
      }
      if (draft.tick >= MATCH_TICKS) {
        draft.finished = true;
        log(draft, "Match finished");
      }
    }),
  }),
);

/** @typedef {typeof schema extends import('../../src/index.js').ActionSchema<GameState, infer D extends import('../../src/index.js').Definitions<GameState>> ? D : never} GameActions */
/** @typedef {import('../../src/index.js').ViewContext<GameState, GameActions>} GameContext */
/** @param {((context:GameContext) => import('../../src/index.js').Child) | undefined} [view] */
export function createGame(view) {
  return createApp({
    schema,
    simulation,
    initialState: initialState(),
    controls: { seed: 42 },
    ...(view ? { view } : {}),
  });
}
