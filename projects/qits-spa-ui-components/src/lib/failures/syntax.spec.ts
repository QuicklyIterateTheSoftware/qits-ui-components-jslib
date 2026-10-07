import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  highlighterFor,
  JavaHighlighter,
  QITS_PLAIN_HIGHLIGHTER,
  TypeScriptHighlighter,
  type QitsCodeToken,
  type QitsSyntaxHighlighter,
} from './syntax';

const FIXTURES = resolve(
  process.cwd(),
  'projects/qits-spa-ui-components/src/lib/failures/fixtures/syntax',
);

function fixture(name: string): string[] {
  return readFileSync(`${FIXTURES}/${name}`, 'utf8').split('\n');
}

/** `[type, text]` pairs — the shape the expectations below are written in. */
function stream(tokens: readonly QitsCodeToken[]): [string, string][] {
  return tokens.map((token) => [token.type, token.text]);
}

const java = new JavaHighlighter();
const typescript = new TypeScriptHighlighter();

describe('JavaHighlighter', () => {
  const lines = fixture('CiReportResourceTest.java');
  const tokens = java.highlight(lines);
  const at = (line: number) => stream(tokens[line - 1]);

  it('reads keywords, types and punctuation', () => {
    expect(at(11)).toEqual([
      ['keyword', 'class'],
      ['plain', ' '],
      ['type', 'CiReportResourceTest'],
      ['plain', ' '],
      ['punctuation', '{'],
    ]);
  });

  it('carries a block comment across its lines', () => {
    expect([at(5), at(6), at(7), at(8)]).toEqual([
      [['comment', '/*']],
      [['comment', ' * A block comment that spans']],
      [['comment', ' * three lines.']],
      [['comment', ' */']],
    ]);
    expect(at(9)).toEqual([['annotation', '@QuarkusTest']]);
  });

  it('reads an annotation with arguments', () => {
    expect(at(10)).toEqual([
      ['annotation', '@TestHTTPEndpoint'],
      ['punctuation', '('],
      ['plain', 'value '],
      ['punctuation', '='],
      ['plain', ' '],
      ['type', 'CiReportResource'],
      ['punctuation', '.'],
      ['keyword', 'class'],
      ['punctuation', ','],
      ['plain', ' path '],
      ['punctuation', '='],
      ['plain', ' '],
      ['string', '"/runs"'],
      ['punctuation', ')'],
    ]);
  });

  it('reads a text block as one string across its lines', () => {
    expect(at(18).slice(-1)).toEqual([['string', '"""']]);
    expect(at(19)).toEqual([['string', '        {"kind": "test-results", "version": 1}']]);
    expect(at(20)).toEqual([
      ['string', '        """'],
      ['punctuation', ';'],
    ]);
  });

  it('reads numbers, char literals, strings and a line comment', () => {
    expect(at(13).slice(-2)).toEqual([
      ['number', '0x7FFF_FFFFL'],
      ['punctuation', ';'],
    ]);
    expect(at(14)).toContainEqual(['string', "'\\''"]);
    expect(at(21).slice(-1)).toEqual([['comment', '// the door']]);
    expect(at(22)).toEqual([
      ['plain', '    assertEquals'],
      ['punctuation', '('],
      ['number', '403'],
      ['punctuation', ','],
      ['plain', ' status'],
      ['punctuation', ','],
      ['plain', ' '],
      ['string', '"another run\'s token is refused"'],
      ['punctuation', ');'],
    ]);
    expect(at(23)).toContainEqual(['number', '1.5e3d']);
  });
});

describe('TypeScriptHighlighter', () => {
  const lines = fixture('report-reader.ts');
  const tokens = typescript.highlight(lines);
  const at = (line: number) => stream(tokens[line - 1]);

  it('carries a block comment across its lines', () => {
    expect([at(3), at(4)]).toEqual([
      [['comment', '/* a block comment']],
      [['comment', '   across two lines */']],
    ]);
  });

  it('reads a decorator and the template literal inside it', () => {
    expect(at(5)).toEqual([
      ['annotation', '@Component'],
      ['punctuation', '({'],
      ['plain', ' selector'],
      ['punctuation', ':'],
      ['plain', ' '],
      ['string', "'qits-spec'"],
      ['punctuation', ','],
      ['plain', ' template'],
      ['punctuation', ':'],
      ['plain', ' '],
      ['string', '`<p>{{ label() }}</p>`'],
      ['plain', ' '],
      ['punctuation', '})'],
    ]);
  });

  it('lexes a template literal’s ${} holes as code', () => {
    expect(at(11)).toEqual([
      ['keyword', 'const'],
      ['plain', ' url '],
      ['punctuation', '='],
      ['plain', ' '],
      ['string', '`'],
      ['punctuation', '${'],
      ['plain', 'origin'],
      ['punctuation', '}'],
      ['string', '/ci/api/runs/'],
      ['punctuation', '${'],
      ['plain', 'encodeURIComponent'],
      ['punctuation', '('],
      ['plain', 'name'],
      ['punctuation', ')}'],
      ['string', '/reports`'],
      ['punctuation', ';'],
    ]);
  });

  it('nests a template literal inside a hole', () => {
    expect(at(12)).toEqual([
      ['keyword', 'const'],
      ['plain', ' nested '],
      ['punctuation', '='],
      ['plain', ' '],
      ['string', '`outer '],
      ['punctuation', '${'],
      ['plain', 'flag '],
      ['punctuation', '?'],
      ['plain', ' '],
      ['string', '`inner '],
      ['punctuation', '${'],
      ['plain', 'count'],
      ['punctuation', '}'],
      ['string', '`'],
      ['plain', ' '],
      ['punctuation', ':'],
      ['plain', ' '],
      ['string', "'none'"],
      ['punctuation', '}'],
      ['string', ' done`'],
      ['punctuation', ';'],
    ]);
  });

  it('carries a template literal across lines, holes included', () => {
    expect(at(13).slice(-1)).toEqual([['string', '`first line']]);
    expect(at(14)).toEqual([
      ['string', 'second '],
      ['punctuation', '${'],
      ['plain', 'value'],
      ['punctuation', '}'],
      ['string', ' line'],
    ]);
    expect(at(15)).toEqual([
      ['string', 'third`'],
      ['punctuation', ';'],
    ]);
  });

  it('tells a regex literal from a division', () => {
    expect(at(16)).toEqual([
      ['keyword', 'const'],
      ['plain', ' pattern '],
      ['punctuation', '='],
      ['plain', ' '],
      ['string', '/^[a-z/]+\\d{2,}$/gi'],
      ['punctuation', ';'],
    ]);
    expect(at(17)).toEqual([
      ['keyword', 'const'],
      ['plain', ' ratio '],
      ['punctuation', '='],
      ['plain', ' total '],
      ['punctuation', '/'],
      ['plain', ' '],
      ['number', '2'],
      ['plain', ' '],
      ['punctuation', '/'],
      ['plain', ' count'],
      ['punctuation', ';'],
    ]);
  });

  it('reads numbers, keywords, strings and a line comment', () => {
    expect(at(18)).toEqual([['comment', "// The door answers 403 to another run's token."]]);
    expect(at(19)).toContainEqual(['number', '0x1f']);
    expect(at(19)).toContainEqual(['number', '10n']);
    expect(at(20).slice(0, 4)).toEqual([
      ['plain', '  '],
      ['keyword', 'return'],
      ['plain', ' '],
      ['keyword', 'await'],
    ]);
    expect(at(20)).toContainEqual(['string', '"include"']);
  });

  it('does not let one line’s unclosed string leak into the next', () => {
    expect(stream(typescript.highlight(["const a = 'open", 'const b = 1;'])[1])).toEqual([
      ['keyword', 'const'],
      ['plain', ' b '],
      ['punctuation', '='],
      ['plain', ' '],
      ['number', '1'],
      ['punctuation', ';'],
    ]);
  });
});

describe('every highlighter', () => {
  const pairs: [string, QitsSyntaxHighlighter][] = readdirSync(FIXTURES).map((name) => [
    name,
    name.endsWith('.java') ? java : typescript,
  ]);

  it.each(pairs)('rejoins %s to its input on every line', (name, highlighter) => {
    const lines = fixture(name);
    const tokens = highlighter.highlight(lines);
    expect(tokens).toHaveLength(lines.length);
    lines.forEach((line, index) => {
      expect(tokens[index].map((token) => token.text).join('')).toBe(line);
      expect(tokens[index].every((token) => token.text.length > 0)).toBe(true);
    });
  });

  it.each(pairs)('rejoins %s cut at every line as an excerpt', (name, highlighter) => {
    const lines = fixture(name);
    for (let start = 0; start < lines.length; start++) {
      const excerpt = lines.slice(start);
      highlighter.highlight(excerpt).forEach((tokens, index) => {
        expect(tokens.map((token) => token.text).join('')).toBe(excerpt[index]);
      });
    }
  });
});

describe('highlighterFor', () => {
  it('finds the registered highlighter for a language, case-insensitively', () => {
    expect(highlighterFor('java', [java, typescript])).toBe(java);
    expect(highlighterFor('TypeScript', [java, typescript])).toBe(typescript);
    expect(highlighterFor('javascript', [java, typescript])).toBe(typescript);
  });

  it('falls back to plain — one token per line', () => {
    const plain = highlighterFor('kotlin', [java, typescript]);
    expect(plain).toBe(QITS_PLAIN_HIGHLIGHTER);
    expect(plain.highlight(['fun main() {', ''])).toEqual([
      [{ text: 'fun main() {', type: 'plain' }],
      [{ text: '', type: 'plain' }],
    ]);
    expect(highlighterFor('java', null)).toBe(QITS_PLAIN_HIGHLIGHTER);
  });
});
