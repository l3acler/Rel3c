import { createTodoMVC } from "./app.js";

export const app = createTodoMVC();
const target = document.getElementById('root');
if (!target) throw Error('TodoMVC needs its #root mount container.');
app.mount(target);
