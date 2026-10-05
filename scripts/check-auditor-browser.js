// Browser-only inspection belongs to this test harness, never to the example.
export async function checkAuditorBrowser({ open }, tests) {
  const page = await open('examples/auditor/');
  const check = (name, passed) => {
    if (!passed) throw Error('B.11 auditor: ' + name);
    tests.results.push({ name: 'B.11 auditor: ' + name, passed: true }); tests.passed++;
  };
  await page.waitFor('document.getElementById("total")?.textContent === "2"');
  check('README app creates nested elements, attributes and two keyed rows', await page.evaluate(`
    document.getElementById('board').className === 'task-board'
    && document.getElementById('board').getAttribute('data-example') === 'public-api'
    && document.querySelectorAll('#task-list > li').length === 2
  `));
  await page.evaluate('document.getElementById("new-task").focus(); true');
  for (const type of ['keyDown', 'keyUp']) await page.command('Input.dispatchKeyEvent', {
    type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    text: type === 'keyDown' ? '\r' : '',
  });
  await page.waitFor('!!document.getElementById("title")');
  check('native required-field validation prevents an empty submit', await page.evaluate(`(async () => {
    const { app } = await import('/examples/auditor/main.js');
    const version = app.stateVersion; document.getElementById('save').click();
    return app.route.path === '/new' && app.stateVersion === version
      && document.getElementById('title').validity.valueMissing;
  })()`));
  await page.evaluate('document.getElementById("title").focus(); true');
  await page.command('Input.insertText', { text: 'Discard' });
  for (const type of ['keyDown', 'keyUp']) await page.command('Input.dispatchKeyEvent', {
    type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
  });
  await page.waitFor('document.getElementById("last-key")?.textContent === "Escape" && document.getElementById("title")?.value === ""');
  check('semantic Escape updates shared state without replacing the focused field', await page.evaluate('document.activeElement === document.getElementById("title")'));
  await page.command('Input.insertText', { text: 'مرحبا <img src=x> 🎉' });
  for (const type of ['keyDown', 'keyUp']) await page.command('Input.dispatchKeyEvent', {
    type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : '',
  });
  await page.waitFor('document.getElementById("total")?.textContent === "3" && !!document.getElementById("task-list")');
  check('trusted Unicode editing and native Enter submit commit shared state before navigation', await page.evaluate(`(async () => {
    const { app } = await import('/examples/auditor/main.js');
    return app.route.path === '/' && app.state.board.rows[2].title === 'مرحبا <img src=x> 🎉'
      && app.state.draft === '' && !document.querySelector('#task-list img');
  })()`));
  check('click toggles one item; reorder retains its node and keyboard focus', await page.evaluate(`(async () => {
    const { app } = await import('/examples/auditor/main.js');
    const row = document.querySelector('[data-id="3"]'), toggle = row.querySelector('button');
    toggle.click(); app.flush(); toggle.focus(); document.getElementById('reverse').click(); app.flush();
    return document.querySelector('[data-id="3"]') === row && document.activeElement === toggle
      && toggle.getAttribute('aria-pressed') === 'true' && row.querySelector('span').classList.contains('complete')
      && app.state.board.rows[0].id === 3;
  })()`));
  await page.evaluate('document.getElementById("scroll-area").scrollTop = 40; true');
  await page.waitFor('document.getElementById("scroll-position")?.textContent === "40"');
  check('native scroll reads outside an action and dispatches a scalar input', true);
  check('query changes retain editing focus; browser back/forward retain shared state', await page.evaluate(`(async () => {
    const { app } = await import('/examples/auditor/main.js');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    document.getElementById('new-task').click(); await frame();
    const field = document.getElementById('title'); field.focus(); app.actions.edit('Resume later'); app.flush();
    field.setSelectionRange(1, 4); app.navigate('?tab=help'); await frame();
    const retained = document.getElementById('title') === field && document.activeElement === field
      && field.selectionStart === 1 && field.selectionEnd === 4;
    document.getElementById('cancel').click(); await frame();
    await new Promise(resolve => { window.addEventListener('popstate', resolve, { once: true }); history.back(); }); await frame();
    const back = app.route.path === '/new' && document.getElementById('title').value === 'Resume later';
    await new Promise(resolve => { window.addEventListener('popstate', resolve, { once: true }); history.forward(); }); await frame();
    app.flushPersistence();
    return retained && back && app.route.path === '/' && app.state.board.rows.length === 3;
  })()`));
  await page.command('Page.reload');
  await page.waitFor('document.getElementById("total")?.textContent === "3"');
  check('reload restores local board/session draft, resets memory, and disposal releases resources', await page.evaluate(`(async () => {
    const { app } = await import('/examples/auditor/main.js');
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    const retained = app.state.board.rows[0].id === 3 && app.state.board.nextId === 4
      && app.state.draft === 'Resume later' && app.state.scroll === 0 && app.state.key === '';
    const detached = document.querySelector('[data-id="3"] button'); app.dispose(); detached.click();
    return retained && app.status === 'disposed' && !document.getElementById('app').firstChild
      && Object.values(resourceCounts(app)).every(value => value === 0);
  })()`));
}
