export async function checkRecordingBrowser({ open }, tests) {
  const page = await open('examples/recording/');
  const check = (name, passed) => {
    if (!passed) throw Error('Recording example: ' + name);
    tests.results.push({ name: 'Recording example: ' + name, passed: true }); tests.passed++;
  };
  await page.waitFor('document.getElementById("recent") !== null');
  await page.evaluate(`(async () => {
    window.recordingExample = await import('/examples/recording/main.js');
    window.recordingAPI = await import('/src/index.js');
    window.recordingClick = id => { document.getElementById(id).click(); recordingExample.app.flush(); };
    return true;
  })()`);
  check('recent eviction and session limits preserve the captured end under manual stepping', await page.evaluate(`(() => {
    const { app } = recordingExample;
    recordingClick('recent');
    for (let i = 0; i < 25; i++) recordingClick('sample');
    recordingClick('export');
    const recent = recordingAPI.readRecording(app.state.exported);
    recordingClick('session');
    for (let i = 0; i < 25; i++) recordingClick('sample');
    recordingClick('export');
    const session = recordingAPI.readRecording(app.state.exported);
    recordingClick('replay'); recordingClick('pause-replay');
    for (let i = 0; i < session.records.length; i++) recordingClick('step-replay');
    return recent.evictedRecords > 0 && recent.end.sequence === 25
      && session.status === 'limit-reached' && session.reason === 'action-limit'
      && session.records.length === 20 && app.state.n === 50
      && recordingExample.replay.status.status === 'complete'
      && recordingExample.replay.app.snapshot() === session.end.snapshot
      && document.getElementById('step-replay').disabled;
  })()`));
  check('animation first displays its baseline without changing the live samples', await page.evaluate(`(() => {
    recordingClick('session');
    for (let i = 0; i < 3; i++) recordingClick('sample');
    recordingClick('export');
    window.playbackEnd = recordingAPI.readRecording(recordingExample.app.state.exported).end.snapshot;
    recordingClick('replay');
    return recordingExample.replay.status.position === 0 && recordingExample.app.state.playback === 'playing'
      && document.getElementById('replay-host').textContent.startsWith('Replayed samples: 50;')
      && recordingExample.app.state.n === 53;
  })()`));
  await page.waitFor('recordingExample.replay.status.position === 1');
  check('a timer displays the first intermediate state; pause holds it beyond the delay', await page.evaluate(`(async () => {
    recordingClick('pause-replay');
    const position = recordingExample.replay.status.position;
    const text = document.getElementById('replay-host').textContent;
    await new Promise(resolve => setTimeout(resolve, 650));
    return position === 1 && text.startsWith('Replayed samples: 51;')
      && recordingExample.replay.status.position === position
      && document.getElementById('replay-host').textContent === text
      && document.getElementById('pause-replay').textContent === 'Resume replay';
  })()`));
  check('Step once renders exactly one more step and stays paused', await page.evaluate(`(() => {
    recordingClick('step-replay');
    return recordingExample.replay.status.position === 2 && recordingExample.app.state.playback === 'paused'
      && document.getElementById('replay-host').textContent.startsWith('Replayed samples: 52;');
  })()`));
  await page.evaluate('recordingClick("pause-replay"); true');
  await page.waitFor('recordingExample.app.state.playback === "complete"');
  check('resume finishes at the recorded snapshot and disables playback controls', await page.evaluate(`
    recordingExample.replay.app.snapshot() === playbackEnd
    && document.getElementById('summary').textContent === 'Replay complete: 3/3 steps; all hashes matched.'
    && document.getElementById('pause-replay').disabled && document.getElementById('step-replay').disabled`));
  check('restart, re-export and a new recording cancel old playback and remove its view', await page.evaluate(`(async () => {
    recordingClick('replay'); const first = recordingExample.replay;
    recordingClick('replay'); const second = recordingExample.replay;
    const restarted = first.status.status === 'disposed' && second.status.position === 0;
    recordingClick('export');
    const exported = second.status.status === 'disposed' && recordingExample.replay === null
      && !document.getElementById('replay-host').firstChild;
    recordingClick('replay'); const third = recordingExample.replay;
    recordingClick('session'); const version = recordingExample.app.stateVersion;
    await new Promise(resolve => setTimeout(resolve, 650));
    return restarted && exported && third.status.status === 'disposed' && recordingExample.replay === null
      && !document.getElementById('replay-host').firstChild && recordingExample.app.stateVersion === version;
  })()`));
  check('an empty recording completes immediately without scheduling progress', await page.evaluate(`(async () => {
    recordingClick('export'); recordingClick('replay');
    const version = recordingExample.app.stateVersion;
    await new Promise(resolve => setTimeout(resolve, 650));
    return recordingExample.replay.status.total === 0 && recordingExample.app.state.playback === 'complete'
      && recordingExample.app.stateVersion === version && document.getElementById('step-replay').disabled;
  })()`));
  await page.evaluate(`(() => {
    const schema = recordingAPI.createActionSchema({ version: recordingExample.schema.version })(({ action }) => ({
      sample: action((draft, services) => { draft.n += 2; draft.draw = services.random(); draft.time = services.now(); }),
    }));
    const changed = recordingAPI.createApp({ schema,
      initialState: { n: 0, draw: 0, time: 0, summary: '', exported: '', playback: 'idle' }, controls: { seed: 7 } });
    changed.startRecording(); changed.actions.sample(); changed.actions.sample(); changed.stopRecording();
    recordingExample.app.actions.output({ summary: 'Mismatch fixture', exported: changed.exportRecording(), playback: 'idle' });
    changed.dispose(); recordingExample.app.flush(); recordingClick('replay'); return true;
  })()`);
  await page.waitFor('recordingExample.app.state.playback === "diverged"');
  check('a divergent step stops animation before subsequent recorded work', await page.evaluate(`(async () => {
    const position = recordingExample.replay.status.position;
    await new Promise(resolve => setTimeout(resolve, 650));
    return position === 1 && recordingExample.replay.status.total === 2
      && recordingExample.replay.status.position === position
      && recordingExample.app.state.playback === 'diverged'
      && document.getElementById('summary').textContent.includes('Replay diverged: 1/2 steps;')
      && document.getElementById('pause-replay').disabled && document.getElementById('step-replay').disabled;
  })()`));
  check('disposal cancels pending playback and releases both applications', await page.evaluate(`(async () => {
    recordingClick('session'); recordingClick('sample'); recordingClick('export'); recordingClick('replay');
    const active = recordingExample.replay;
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    recordingExample.app.dispose();
    await new Promise(resolve => setTimeout(resolve, 650));
    return active.status.status === 'disposed' && recordingExample.replay === null
      && !document.getElementById('app').firstChild
      && Object.values(resourceCounts(recordingExample.app)).every(value => value === 0)
      && Object.values(resourceCounts(active.app)).every(value => value === 0);
  })()`));
}
