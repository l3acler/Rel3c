export async function checkGameReplayBrowser({ open }, tests) {
  const page = await open('examples/game-replay/');
  const check = (name, passed) => {
    if (!passed) throw Error('Game replay: ' + name);
    tests.results.push({ name: 'Game replay: ' + name, passed: true }); tests.passed++;
  };
  await page.waitFor('document.querySelectorAll("#live-host [data-player]").length === 4');
  await page.evaluate(`(async () => {
    window.arenaExample = await import('/examples/game-replay/main.js');
    window.arenaAPI = await import('/src/index.js');
    window.arenaClick = id => { document.getElementById(id).click(); arenaExample.ui.flush(); };
    return true;
  })()`);
  check('initial world renders four keyed players and six coins through public views', await page.evaluate(`
    document.querySelectorAll('#live-host [data-player]').length === 4
    && document.querySelectorAll('#live-host [data-coin]').length === 6
    && document.getElementById('replay-match').disabled && document.getElementById('stop-match').disabled`));
  await page.evaluate('arenaClick("start-match"); true');
  await page.waitFor('arenaExample.game.state.tick >= 3');
  check('the automatic live driver moves the simulated players and focuses native controls', await page.evaluate(`
    document.activeElement.id === 'live-arena'
    && arenaExample.game.state.players[1].x !== 78 && arenaExample.game.state.players[2].y !== 75
    && arenaExample.game.recording.status === 'active'`));
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await page.waitFor('arenaExample.game.state.players[0].x > 18');
  for (const [key, code, number] of [[' ', 'Space', 32], ['e', 'KeyE', 69]]) {
    for (const type of ['keyDown', 'keyUp']) await page.command('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number });
  }
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await page.waitFor('arenaExample.game.state.players[0].dx === 0 && arenaExample.game.state.players[0].emote === "Hello!" && document.querySelector(\'#live-host [data-player="1"] .emote\')?.textContent === "Hello!"');
  const keyboard = await page.evaluate(`({
    commands: arenaExample.game.state.commands,
    dashUntil: arenaExample.game.state.players[0].dashUntil,
    emote: document.querySelector('#live-host [data-player="1"] .emote').textContent,
  })`);
  if (keyboard.commands < 4 || keyboard.dashUntil <= 0 || keyboard.emote !== 'Hello!')
    throw Error('Game replay keyboard state: ' + JSON.stringify(keyboard));
  check('trusted keyboard movement, dash, emote and release execute as tick inputs', true);
  check('stop drains pending button commands and exports a paused, verifiable match', await page.evaluate(`(() => {
    arenaClick('move-right'); arenaClick('dash'); arenaClick('emote'); arenaClick('stop-match');
    window.arenaLog = arenaAPI.readRecording(arenaExample.ui.state.exported);
    window.arenaEnd = arenaExample.game.snapshot();
    return arenaExample.game.ticks.paused && arenaExample.game.ticks.queuedInputs === 0
      && arenaExample.ui.state.captured && arenaLog.end.snapshot === arenaEnd
      && arenaLog.records.some(record => record.events.some(event => event.type === 'input' && event.phase === 'dispatched'));
  })()`));
  await page.evaluate('arenaClick("replay-match"); true');
  check('a second arena shows the recorded baseline before playback advances', await page.evaluate(`
    arenaExample.replay.status.position === 0 && arenaExample.replay.app.state.tick === 0
    && document.querySelectorAll('#replay-host [data-player]').length === 4
    && document.querySelector('#replay-host [data-player="1"]').style.left === '18%'`));
  await page.waitFor('arenaExample.replay.status.position === 1');
  check('slow playback paints an intermediate world and pause holds its position', await page.evaluate(`(async () => {
    arenaClick('pause-game-replay');
    const position = arenaExample.replay.status.position;
    const locations = Array.from(document.querySelectorAll('#replay-host [data-player]'), node => node.style.left + ':' + node.style.top).join(',');
    await new Promise(resolve => setTimeout(resolve, 400));
    return position === 1 && arenaExample.replay.status.position === position
      && arenaExample.ui.state.playback === 'paused'
      && Array.from(document.querySelectorAll('#replay-host [data-player]'), node => node.style.left + ':' + node.style.top).join(',') === locations;
  })()`));
  check('manual stepping advances one complete recorded tick while live state stays unchanged', await page.evaluate(`(() => {
    arenaClick('step-game-replay');
    return arenaExample.replay.status.position === 2 && arenaExample.replay.app.state.tick === 2
      && arenaExample.ui.state.playback === 'paused' && arenaExample.game.snapshot() === arenaEnd;
  })()`));
  await page.evaluate(`(() => {
    const speed = document.getElementById('replay-speed'); speed.value = '50'; speed.dispatchEvent(new Event('change', { bubbles: true }));
    arenaClick('pause-game-replay'); return true;
  })()`);
  await page.waitFor('arenaExample.ui.state.playback === "complete"');
  check('fast playback completes with identical world, scores, random continuation and clock', await page.evaluate(`
    arenaExample.ui.state.speed === 50 && arenaExample.replay.app.snapshot() === arenaEnd
    && arenaExample.game.snapshot() === arenaEnd
    && document.getElementById('game-summary').textContent.includes('all hashes matched')
    && document.getElementById('step-game-replay').disabled`));
  check('starting a new match cancels playback and disposes the previous live and replay worlds', await page.evaluate(`(async () => {
    const original = arenaExample.game;
    arenaClick('replay-match'); const oldReplay = arenaExample.replay;
    arenaClick('start-match'); arenaClick('pause-match');
    await new Promise(resolve => setTimeout(resolve, 400));
    return original.status === 'disposed' && oldReplay.status.status === 'disposed'
      && arenaExample.replay === null && !document.getElementById('replay-host').firstChild
      && arenaExample.game.state.tick === 0 && arenaExample.ui.state.exported === '';
  })()`));
  check('the finished world automatically exports at the match boundary under manual ticks', await page.evaluate(`(() => {
    for (let index = 0; index < 120; index++) arenaClick('advance-match');
    return arenaExample.game.state.finished && arenaExample.game.state.tick === 120
      && arenaExample.game.ticks.paused && arenaExample.ui.state.captured
      && arenaAPI.readRecording(arenaExample.ui.state.exported).end.snapshot === arenaExample.game.snapshot();
  })()`));
  await page.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check('the two arenas stack without horizontal overflow at a phone-sized viewport', await page.evaluate('document.documentElement.scrollWidth <= 390'));
  check('unmount cancels timers and releases UI, live and replay resources', await page.evaluate(`(async () => {
    arenaClick('replay-match'); const controller = arenaExample.replay, world = arenaExample.game;
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    arenaExample.ui.dispose();
    await new Promise(resolve => setTimeout(resolve, 400));
    return controller.status.status === 'disposed' && world.status === 'disposed'
      && !document.getElementById('app').firstChild
      && [arenaExample.ui, world, controller.app].every(app => Object.values(resourceCounts(app)).every(value => value === 0));
  })()`));
}
