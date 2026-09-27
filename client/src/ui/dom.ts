/**
 * The smallest thing that makes building elements in TypeScript bearable. Not a framework:
 * there is no reactivity here, and every view re-renders by replacing its own children.
 */

type Child = Node | string | number | null | undefined | false;

interface Props {
  class?: string;
  text?: string | number;
  title?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration>;
  /** Anything else lands as an attribute (`colspan`, `hidden`, `aria-label`, `data-*`, …) */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = String(props.text);
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title) node.title = props.title;
  if (props.style) Object.assign(node.style, props.style);

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const [event, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(event, handler as EventListener);
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Throws rather than returning null, so a typo in a selector fails loudly at boot. */
export function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}
