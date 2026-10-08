export async function checkTodoMVCBrowser({ open }, tests) {
  const page = await open('examples/todomvc/');
  const check = (name, passed) => {
    if (!passed) throw Error('TodoMVC: ' + name);
    tests.results.push({ name: 'TodoMVC: ' + name, passed: true }); tests.passed++;
  };
  await page.waitFor('document.querySelector(".new-todo") !== null');
  await page.evaluate(`(async () => { window.todoApp = (await import('/examples/todomvc/main.js')).app; return true; })()`);
  await page.waitFor('document.activeElement === document.querySelector(".new-todo")');
  check('reference classes, IDs, test selectors and empty visibility', await page.evaluate(`
    document.querySelector('section.todoapp#root') !== null &&
    document.querySelector('[data-testid="header"] h1').textContent === 'todos' &&
    document.getElementById('main').hidden && document.getElementById('footer').hidden &&
    document.querySelector('input#toggle-all.toggle-all[data-testid="toggle-all"]') !== null &&
    document.querySelector('label[for="toggle-all"]').className === 'toggle-all-label' &&
    document.querySelector('ul.todo-list[data-testid="todo-list"]') !== null &&
    document.querySelector('ul.filters[data-testid="footer-navigation"]') !== null`));
  const key = async (name, code = name, number = name === 'Enter' ? 13 : 27) => {
    for (const type of ['keyDown', 'keyUp']) await page.command('Input.dispatchKeyEvent', {
      type, key: name, code, windowsVirtualKeyCode: number,
      ...(name === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}),
    });
  };
  const add = async title => {
    await page.evaluate('document.querySelector(".new-todo").focus(); true');
    await page.command('Input.insertText', { text: title }); await key('Enter');
  };
  const pointer = async (selector, clickCount = 1) => {
    const point = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.command('Input.dispatchMouseEvent', {
      type, ...point, button: 'left', clickCount,
    });
  };
  await add('   ');
  check('whitespace Enter adds nothing', await page.evaluate('window.todoApp.state.board.todos.length === 0'));
  await page.evaluate('document.querySelector(".new-todo").select(); true');
  await add('  Learn Rel3c  '); await page.waitFor('document.querySelectorAll(".todo-list li").length === 1');
  check('trusted Enter trims, clears input and renders singular counter', await page.evaluate(`
    document.querySelector('.todo-list label').textContent === 'Learn Rel3c' &&
    document.querySelector('.new-todo').value === '' &&
    document.querySelector('.todo-count strong').textContent === '1' &&
    document.querySelector('.todo-count').textContent === '1 item left'`));
  await add('مرحبا <img src=x> 😀'); await page.waitFor('document.querySelectorAll(".todo-list li").length === 2');
  check('Unicode titles stay escaped and pluralize', await page.evaluate(`
    !document.querySelector('.todo-list img') && document.querySelector('.todo-count').textContent === '2 items left'`));
  await pointer('.todo-list li .toggle');
  await page.waitFor('document.querySelector(".todo-list li").classList.contains("completed")');
  check('completion synchronizes checkbox, class and clear button', await page.evaluate(`
    document.querySelector('.todo-list li .toggle').checked &&
    !document.querySelector('.clear-completed').hidden && !document.getElementById('toggle-all').checked`));
  await pointer('.filters a[href="#/active"]');
  await page.waitFor('location.hash === "#/active" && document.querySelectorAll(".todo-list li").length === 1');
  check('Active routes at model level while retaining shared state', await page.evaluate(`
    window.todoApp.state.board.todos.length === 2 && document.querySelector('.filters .selected').textContent === 'Active' &&
    document.querySelector('.todo-list label').textContent === 'مرحبا <img src=x> 😀'`));
  await pointer('.todo-list .toggle');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 0');
  check('completing an Active item removes it from the current filter', true);
  await pointer('.filters a[href="#/completed"]');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 2');
  await page.evaluate('history.back(); true');
  await page.waitFor('window.todoApp.route.path === "/active" && document.querySelectorAll(".todo-list li").length === 0');
  await page.evaluate('history.forward(); true');
  await page.waitFor('window.todoApp.route.path === "/completed" && document.querySelectorAll(".todo-list li").length === 2');
  check('native back/forward updates URL, selected link and filter', true);
  await pointer('#toggle-all');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 0');
  await pointer('.filters a[href="#/"]');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 2');
  check('bulk toggle updates the entire store from a filtered route', await page.evaluate('window.todoApp.state.board.todos.every(todo => !todo.completed)'));
  await pointer('.todo-list li label', 2);
  await page.waitFor('document.activeElement === document.querySelector(".edit")');
  await page.evaluate('document.querySelector(".edit").select(); true');
  await page.command('Input.insertText', { text: '  Edited  ' }); await key('Enter');
  await page.waitFor('!document.querySelector(".edit") && document.querySelector(".todo-list li label").textContent === "Edited"');
  check('double-click focuses editor; Enter trims and exits editing', true);
  await pointer('.todo-list li label', 2);
  await page.waitFor('document.activeElement === document.querySelector(".edit")');
  await page.evaluate('document.querySelector(".edit").select(); true');
  await page.command('Input.insertText', { text: 'Discarded' }); await key('Escape');
  await page.waitFor('!document.querySelector(".edit")');
  check('Escape discards changes even when editor removal blurs', await page.evaluate('document.querySelector(".todo-list li label").textContent === "Edited"'));
  await pointer('.todo-list li label', 2);
  await page.waitFor('document.activeElement === document.querySelector(".edit")');
  await page.evaluate('document.querySelector(".edit").select(); true');
  await page.command('Input.insertText', { text: 'Saved on blur' });
  await pointer('.new-todo');
  await page.waitFor('!document.querySelector(".edit") && document.querySelector(".todo-list li label").textContent === "Saved on blur"');
  check('native blur saves exactly the current edit', true);
  await pointer('.todo-list li label', 2);
  await page.waitFor('document.activeElement === document.querySelector(".edit")');
  await page.evaluate('document.querySelector(".edit").select(); true');
  await page.command('Input.insertText', { text: ' ' }); await key('Enter');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 1');
  check('empty edited title deletes its row', true);
  await pointer('.todo-list li label', 2);
  await page.waitFor('document.activeElement === document.querySelector(".edit")');
  await page.command('Input.insertText', { text: ' Unsaved' });
  await page.evaluate('window.todoApp.flushPersistence(); true');
  await page.command('Page.reload');
  await page.waitFor('document.querySelectorAll(".todo-list li").length === 1');
  check('reload restores persisted titles and drops transient editing', await page.evaluate(`
    !document.querySelector('.edit') && document.querySelector('.todo-list label').textContent === 'مرحبا <img src=x> 😀'`));
  await pointer('#toggle-all');
  await page.waitFor('document.querySelector(".todo-list li").classList.contains("completed")');
  await pointer('.filters a[href="#/completed"]');
  await page.evaluate('(async () => { window.todoApp = (await import("/examples/todomvc/main.js")).app; window.todoApp.flushPersistence(); return true; })()');
  await page.command('Page.reload');
  await page.waitFor('document.querySelector(".filters .selected")?.textContent === "Completed"');
  check('reload retains the hash filter and completed state', await page.evaluate('document.querySelector(".todo-list .toggle").checked'));
  await pointer('.clear-completed');
  await page.waitFor('document.getElementById("main").hidden && document.getElementById("footer").hidden');
  check('clear-completed resets bulk checkbox and empty visibility', await page.evaluate('!document.getElementById("toggle-all").checked'));
  await page.evaluate('(async () => { (await import("/examples/todomvc/main.js")).app.navigate("/"); return true; })()');
  await add('Remove by button'); await page.waitFor('document.querySelector(".todo-list li") !== null');
  await page.evaluate('document.querySelector(".todo-list .destroy").click(); true');
  await page.waitFor('document.getElementById("main").hidden');
  check('destroy removes its item', true);
  check('disposal removes owned DOM and releases handlers', await page.evaluate(`(async () => {
    const { app } = await import('/examples/todomvc/main.js');
    const { resourceCounts } = await import('/src/runtime/diagnostics.js');
    app.flushPersistence(); app.dispose();
    return !document.getElementById('root').firstChild && Object.values(resourceCounts(app)).every(value => value === 0);
  })()`));
}
