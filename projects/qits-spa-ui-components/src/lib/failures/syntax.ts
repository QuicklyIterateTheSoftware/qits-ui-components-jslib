import {
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';

/** One run of a line's text and what it is. A line's tokens always concatenate back to the line. */
export interface QitsCodeToken {
  readonly text: string;
  readonly type:
    'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'annotation' | 'type' | 'punctuation';
}

/**
 * Tokenises an excerpt, line by line. It is handed the **whole excerpt** rather than one line at a
 * time so a block comment, a text block or a template literal that spans lines is read as one.
 * An excerpt that opens inside such a construct starts as code: the lexer sees only what it is
 * given.
 */
export interface QitsSyntaxHighlighter {
  /** Lower-case language names, as `QitsTestCoordinates.language` spells them. */
  readonly languages: readonly string[];
  highlight(lines: readonly string[]): readonly (readonly QitsCodeToken[])[];
}

/** Every registered highlighter. Multi; the later registration for a language wins. */
export const QITS_SYNTAX_HIGHLIGHTERS = new InjectionToken<readonly QitsSyntaxHighlighter[]>(
  'QITS_SYNTAX_HIGHLIGHTERS',
);

/** Register one highlighter. */
export function provideQitsSyntaxHighlighter(
  highlighter: QitsSyntaxHighlighter,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: QITS_SYNTAX_HIGHLIGHTERS, useValue: highlighter, multi: true },
  ]);
}

/** No colour at all: every line one plain token. What a language nobody registered gets. */
export const QITS_PLAIN_HIGHLIGHTER: QitsSyntaxHighlighter = {
  languages: [],
  highlight: (lines) => lines.map((text) => [{ text, type: 'plain' }]),
};

/**
 * The highlighter for `language` — the last registered one that names it — or the plain one.
 * The registry defaults to {@link QITS_SYNTAX_HIGHLIGHTERS}, which needs an injection context;
 * outside one, pass the list.
 */
export function highlighterFor(
  language: string | null | undefined,
  highlighters: readonly QitsSyntaxHighlighter[] | null = inject(QITS_SYNTAX_HIGHLIGHTERS, {
    optional: true,
  }),
): QitsSyntaxHighlighter {
  const wanted = (language ?? '').toLowerCase();
  const found = [...(highlighters ?? [])]
    .reverse()
    .find((highlighter) => highlighter.languages.includes(wanted));
  return found ?? QITS_PLAIN_HIGHLIGHTER;
}

type TokenType = QitsCodeToken['type'];

/** Collects one line's tokens, merging neighbours of one type. */
class LineTokens {
  readonly tokens: QitsCodeToken[] = [];

  push(text: string, type: TokenType): void {
    if (!text) return;
    const last = this.tokens[this.tokens.length - 1];
    if (last && last.type === type) {
      this.tokens[this.tokens.length - 1] = { text: last.text + text, type };
    } else {
      this.tokens.push({ text, type });
    }
  }
}

const WHITESPACE = /^\s+/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*/;

/**
 * The end of a quoted run that started at `from` (just past the opening quote): the index just past
 * the closing quote, or the line's length when it does not close on this line.
 */
function quotedEnd(line: string, from: number, quote: string): number {
  for (let i = from; i < line.length; i++) {
    if (line[i] === '\\') {
      i++;
    } else if (line[i] === quote) {
      return i + 1;
    }
  }
  return line.length;
}

const JAVA_KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double ' +
    'else enum extends final finally float for goto if implements import instanceof int ' +
    'interface long native new package private protected public return short static strictfp ' +
    'super switch synchronized this throw throws transient try void volatile while var record ' +
    'yield sealed permits non-sealed true false null'
  ).split(' '),
);

const JAVA_NUMBER =
  /^(?:0[xX][\da-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?[lLfFdD]?)/;

/**
 * Java, by hand: keywords, string and char literals, text blocks, line and block comments,
 * annotations, numbers, and a capitalised identifier as a `type`. Block comments and text blocks
 * carry over line ends.
 */
export class JavaHighlighter implements QitsSyntaxHighlighter {
  readonly languages: readonly string[] = ['java'];

  highlight(lines: readonly string[]): readonly (readonly QitsCodeToken[])[] {
    let state: 'code' | 'block-comment' | 'text-block' = 'code';
    return lines.map((line) => {
      const out = new LineTokens();
      let i = 0;
      while (i < line.length) {
        if (state === 'block-comment') {
          const close = line.indexOf('*/', i);
          const end = close < 0 ? line.length : close + 2;
          out.push(line.slice(i, end), 'comment');
          if (close >= 0) state = 'code';
          i = end;
          continue;
        }
        if (state === 'text-block') {
          let end = line.length;
          for (let j = i; j < line.length; j++) {
            if (line[j] === '\\') {
              j++;
            } else if (line.startsWith('"""', j)) {
              end = j + 3;
              state = 'code';
              break;
            }
          }
          out.push(line.slice(i, end), 'string');
          i = end;
          continue;
        }
        const rest = line.slice(i);
        const space = WHITESPACE.exec(rest);
        if (space) {
          out.push(space[0], 'plain');
          i += space[0].length;
        } else if (rest.startsWith('//')) {
          out.push(rest, 'comment');
          i = line.length;
        } else if (rest.startsWith('/*')) {
          out.push('/*', 'comment');
          state = 'block-comment';
          i += 2;
        } else if (rest.startsWith('"""')) {
          out.push('"""', 'string');
          state = 'text-block';
          i += 3;
        } else if (rest[0] === '"' || rest[0] === "'") {
          const end = quotedEnd(line, i + 1, rest[0]);
          out.push(line.slice(i, end), 'string');
          i = end;
        } else if (rest[0] === '@' && /^@\s*interface\b/.test(rest)) {
          const match = /^@\s*interface/.exec(rest)![0];
          out.push(match, 'keyword');
          i += match.length;
        } else if (rest[0] === '@' && IDENTIFIER.test(rest.slice(1))) {
          const match = /^@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(rest)![0];
          out.push(match, 'annotation');
          i += match.length;
        } else if (JAVA_NUMBER.test(rest) && /^\.?\d/.test(rest)) {
          const match = JAVA_NUMBER.exec(rest)![0];
          out.push(match, 'number');
          i += match.length;
        } else if (IDENTIFIER.test(rest)) {
          const word = IDENTIFIER.exec(rest)![0];
          const type: TokenType = JAVA_KEYWORDS.has(word)
            ? 'keyword'
            : /^[A-Z]/.test(word)
              ? 'type'
              : 'plain';
          out.push(word, type);
          i += word.length;
        } else {
          out.push(rest[0], 'punctuation');
          i += 1;
        }
      }
      return out.tokens;
    });
  }
}

const TS_KEYWORDS = new Set(
  (
    'abstract any as async await bigint boolean break case catch class const constructor continue ' +
    'debugger declare default delete do else enum export extends false finally for from function ' +
    'get if implements import in infer instanceof interface is keyof let module namespace never ' +
    'new null number object of override package private protected public readonly return ' +
    'satisfies set static string super switch symbol this throw true try type typeof undefined ' +
    'unique unknown var void while with yield'
  ).split(' '),
);

/** Keywords after which a `/` starts a regular expression rather than dividing. */
const TS_REGEX_AFTER_KEYWORDS = new Set(
  'return typeof instanceof in of new delete void throw case do else yield await'.split(' '),
);

const TS_NUMBER =
  /^(?:0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/;

/** One open frame: inside a template literal's text, or inside one of its `${…}` holes. */
type TsFrame = { readonly kind: 'template' } | { kind: 'hole'; depth: number };

/**
 * TypeScript and JavaScript, by hand: keywords, strings, template literals with their `${…}`
 * holes lexed as code (nested templates included), line and block comments, decorators (as
 * `annotation`), numbers and regular-expression literals. Block comments and template literals
 * carry over line ends.
 *
 * A `/` is a regex only where an expression may start — at the start, after an operator or an
 * opening bracket, or after a keyword such as `return` — and only if it closes on its line; a
 * division never does either.
 */
export class TypeScriptHighlighter implements QitsSyntaxHighlighter {
  readonly languages: readonly string[] = ['typescript', 'javascript'];

  highlight(lines: readonly string[]): readonly (readonly QitsCodeToken[])[] {
    const frames: TsFrame[] = [];
    let inComment = false;
    /** The last significant token, for telling a regex from a division. */
    let previous: { text: string; type: TokenType } | null = null;

    return lines.map((line) => {
      const out = new LineTokens();
      const emit = (text: string, type: TokenType): void => {
        out.push(text, type);
        if (type !== 'comment' && text.trim()) previous = { text: text.trim(), type };
      };
      let i = 0;
      while (i < line.length) {
        if (inComment) {
          const close = line.indexOf('*/', i);
          const end = close < 0 ? line.length : close + 2;
          out.push(line.slice(i, end), 'comment');
          if (close >= 0) inComment = false;
          i = end;
          continue;
        }
        const top = frames[frames.length - 1];
        if (top?.kind === 'template') {
          let end = line.length;
          let next: 'close' | 'hole' | null = null;
          for (let j = i; j < line.length; j++) {
            if (line[j] === '\\') {
              j++;
            } else if (line[j] === '`') {
              end = j + 1;
              next = 'close';
              break;
            } else if (line.startsWith('${', j)) {
              end = j;
              next = 'hole';
              break;
            }
          }
          emit(line.slice(i, end), 'string');
          i = end;
          if (next === 'close') {
            frames.pop();
          } else if (next === 'hole') {
            emit('${', 'punctuation');
            frames.push({ kind: 'hole', depth: 0 });
            i += 2;
          }
          continue;
        }
        const rest = line.slice(i);
        const space = WHITESPACE.exec(rest);
        if (space) {
          out.push(space[0], 'plain');
          i += space[0].length;
        } else if (rest.startsWith('//')) {
          out.push(rest, 'comment');
          i = line.length;
        } else if (rest.startsWith('/*')) {
          out.push('/*', 'comment');
          inComment = true;
          i += 2;
        } else if (rest[0] === '`') {
          emit('`', 'string');
          frames.push({ kind: 'template' });
          i += 1;
        } else if (rest[0] === '"' || rest[0] === "'") {
          const end = quotedEnd(line, i + 1, rest[0]);
          emit(line.slice(i, end), 'string');
          i = end;
        } else if (rest[0] === '/' && regexMayStart(previous) && regexEnd(line, i) > 0) {
          const end = regexEnd(line, i);
          emit(line.slice(i, end), 'string');
          i = end;
        } else if (rest[0] === '@' && IDENTIFIER.test(rest.slice(1))) {
          const match = /^@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(rest)![0];
          emit(match, 'annotation');
          i += match.length;
        } else if (/^\.?\d/.test(rest)) {
          const match = TS_NUMBER.exec(rest)?.[0] || rest[0];
          emit(match, 'number');
          i += match.length;
        } else if (IDENTIFIER.test(rest)) {
          const word = IDENTIFIER.exec(rest)![0];
          // A property named like a keyword — `foo.type`, `{ default: 1 }` — is still a keyword
          // here; telling them apart needs a parser, and the colour is the only cost.
          emit(word, TS_KEYWORDS.has(word) ? 'keyword' : 'plain');
          i += word.length;
        } else {
          const ch = rest[0];
          if (top?.kind === 'hole') {
            if (ch === '{') {
              top.depth++;
            } else if (ch === '}') {
              if (top.depth === 0) {
                frames.pop();
                emit('}', 'punctuation');
                i += 1;
                continue;
              }
              top.depth--;
            }
          }
          emit(ch, 'punctuation');
          i += 1;
        }
      }
      return out.tokens;
    });
  }
}

function regexMayStart(previous: { text: string; type: TokenType } | null): boolean {
  if (!previous) return true;
  if (previous.type === 'keyword') return TS_REGEX_AFTER_KEYWORDS.has(previous.text);
  if (previous.type !== 'punctuation') return false;
  const last = previous.text[previous.text.length - 1];
  return !')]}'.includes(last);
}

/** Just past a regex literal's flags, or 0 where the `/` at `from` closes no regex on this line. */
function regexEnd(line: string, from: number): number {
  if (line[from + 1] === '/' || line[from + 1] === '*') return 0;
  let inClass = false;
  for (let j = from + 1; j < line.length; j++) {
    const ch = line[j];
    if (ch === '\\') {
      j++;
    } else if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '/') {
      let end = j + 1;
      while (end < line.length && /[a-z]/i.test(line[end])) end++;
      return end;
    }
  }
  return 0;
}
