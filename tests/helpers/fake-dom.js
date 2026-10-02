// Unit-test DOM double only. Real browser tests independently verify DOM behavior.
export function fakeDocument() {
  class Element {
    constructor() { this.ownerDocument = document; this.nodeType = 1; this.childNodes = []; }
    appendChild(node) {
      if (node.parentNode) node.parentNode.removeChild(node);
      this.childNodes.push(node); node.parentNode = this; return node;
    }
    removeChild(node) {
      const index = this.childNodes.indexOf(node); if (index === -1) throw new Error('Not a child');
      this.childNodes.splice(index, 1); node.parentNode = null; return node;
    }
    get textContent() { return this.childNodes.map(node => node.data ?? node.textContent).join(''); }
  }
  const document = { defaultView: { Element }, createElement: () => new Element(),
    createTextNode: data => ({ nodeType: 3, data, parentNode: null, ownerDocument: document }) };
  return document;
}
