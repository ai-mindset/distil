export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function parseXml(source: string): XmlNode {
  const document: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const stack = [document];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) {
      appendText(stack.at(-1)!, source.slice(cursor));
      break;
    }
    if (open > cursor) appendText(stack.at(-1)!, source.slice(cursor, open));

    if (source.startsWith("<!--", open)) {
      cursor = endOf(source, "-->", open + 4) + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const end = endOf(source, "]]>", open + 9);
      stack.at(-1)!.text += source.slice(open + 9, end);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<?", open)) {
      cursor = endOf(source, "?>", open + 2) + 2;
      continue;
    }
    if (/^<!doctype\b/i.test(source.slice(open, open + 12))) {
      throw new Error("XML DOCTYPE declarations are not supported");
    }

    const close = findTagEnd(source, open + 1);
    const raw = source.slice(open + 1, close).trim();
    cursor = close + 1;
    if (!raw) continue;

    if (raw.startsWith("!")) continue;
    if (raw.startsWith("/")) {
      const name = localName(raw.slice(1).trim().split(/\s/, 1)[0]);
      if (stack.length === 1 || stack.at(-1)!.name !== name) {
        throw new Error(`Malformed XML: unexpected closing tag ${name}`);
      }
      stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const content = selfClosing ? raw.slice(0, -1).trim() : raw;
    const nameEnd = content.search(/\s/);
    const qualifiedName = nameEnd < 0 ? content : content.slice(0, nameEnd);
    const attributeSource = nameEnd < 0 ? "" : content.slice(nameEnd + 1);
    const node: XmlNode = {
      name: localName(qualifiedName),
      attributes: parseAttributes(attributeSource),
      children: [],
      text: "",
    };
    stack.at(-1)!.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  if (stack.length !== 1) {
    throw new Error(`Malformed XML: unclosed tag ${stack.at(-1)!.name}`);
  }
  if (document.children.length !== 1) {
    throw new Error("Malformed XML: expected one root element");
  }
  return document.children[0];
}

export function child(node: XmlNode, ...names: string[]): XmlNode | undefined {
  const expected = new Set(names.map((name) => localName(name)));
  return node.children.find((candidate) => expected.has(candidate.name));
}

export function children(node: XmlNode, ...names: string[]): XmlNode[] {
  const expected = new Set(names.map((name) => localName(name)));
  return node.children.filter((candidate) => expected.has(candidate.name));
}

export function nodeText(node: XmlNode | undefined): string {
  if (!node) return "";
  return decodeXmlEntities(
    [node.text, ...node.children.map((candidate) => nodeText(candidate))].join(" "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity) => {
    if (entity.startsWith("#x")) {
      return safeCodePoint(Number.parseInt(entity.slice(2), 16), match);
    }
    if (entity.startsWith("#")) {
      return safeCodePoint(Number.parseInt(entity.slice(1), 10), match);
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

export function textFromHtml(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/&nbsp;/gi, " ")
      .replace(/&ndash;/gi, "–")
      .replace(/&mdash;/gi, "—")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(source)) !== null) {
    if (source.slice(consumed, match.index).trim()) {
      throw new Error("Malformed XML attribute");
    }
    attributes[localName(match[1])] = decodeXmlEntities(match[2] ?? match[3] ?? "");
    consumed = pattern.lastIndex;
  }
  if (source.slice(consumed).trim()) throw new Error("Malformed XML attribute");
  return attributes;
}

function findTagEnd(source: string, start: number): number {
  let quote = "";
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  throw new Error("Malformed XML: unterminated tag");
}

function appendText(node: XmlNode, value: string): void {
  node.text += value;
}

function endOf(source: string, needle: string, start: number): number {
  const index = source.indexOf(needle, start);
  if (index < 0) throw new Error(`Malformed XML: unterminated ${needle}`);
  return index;
}

function localName(value: string): string {
  return value.split(":").at(-1)!.toLowerCase();
}

function safeCodePoint(value: number, fallback: string): string {
  try {
    return Number.isFinite(value) ? String.fromCodePoint(value) : fallback;
  } catch {
    return fallback;
  }
}
