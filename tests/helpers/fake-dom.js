// Unit-test DOM double. Browser checks independently verify native behavior.
export function fakeDocument() {
  class Node {
    constructor(type) { this.ownerDocument = document; this.nodeType = type; this.childNodes = []; this.parentNode = null; this.listeners = new Map(); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatchEvent(event) {
      const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
      event.target = this; event.composedPath = () => path;
      for (const node of path) for (const listener of [...node.listeners.get(event.type) ?? []]) listener(event);
      return true;
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    get nextSibling() { const list = this.parentNode?.childNodes; return list ? list[list.indexOf(this) + 1] ?? null : null; }
    appendChild(node) { return this.insertBefore(node, null); }
    insertBefore(node, reference) {
      if (node.nodeType === 11) { for (const child of [...node.childNodes]) this.insertBefore(child, reference); return node; }
      if (node.parentNode) node.parentNode.removeChild(node);
      const index = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference);
      if (index < 0) throw Error('Not a child');
      this.childNodes.splice(index, 0, node); node.parentNode = this; return node;
    }
    removeChild(node) {
      const index = this.childNodes.indexOf(node); if (index === -1) throw Error('Not a child');
      this.childNodes.splice(index, 1); node.parentNode = null; return node;
    }
    get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.filter(node => node.nodeType !== 8).map(node => node.textContent).join(''); }
  }
  class Element extends Node {
    constructor(tag = 'div') {
      super(1); this.tagName = tag.toUpperCase(); this.attributes = new Map(); this.style = { cssText: '' };
      this.value = ''; this.checked = false; this.selected = false; this.defaultValue = '';
      this.defaultChecked = false; this.defaultSelected = false; this.type = tag === 'input' ? 'text' : '';
    }
    setAttribute(name, value) { this.attributes.set(name.toLowerCase(), String(value)); if (name === 'type') this.type = String(value); }
    getAttribute(name) { return this.attributes.get(name.toLowerCase()) ?? null; }
    hasAttribute(name) { return this.attributes.has(name.toLowerCase()); }
    removeAttribute(name) { this.attributes.delete(name.toLowerCase()); }
  }
  const frames = new Map();
  let nextFrame = 1;
  const document = { baseURI: 'https://example.test/', defaultView: { Element,
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); } }, createElement: tag => new Element(tag),
    get pendingFrames() { return frames.size; },
    flushFrame() { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(0); },
    createTextNode: data => Object.assign(new Node(3), { data }),
    createComment: data => Object.assign(new Node(8), { data }), createDocumentFragment: () => new Node(11) };
  return document;
}
