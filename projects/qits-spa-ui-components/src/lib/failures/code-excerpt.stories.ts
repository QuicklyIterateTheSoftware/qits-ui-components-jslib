import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';

import { QitsCodeExcerpt } from './code-excerpt';
import { JavaHighlighter, provideQitsSyntaxHighlighter, TypeScriptHighlighter } from './syntax';

const JAVA = [
  '  /*',
  '   * Another run’s token is refused: a run may only submit reports for itself.',
  '   */',
  '  @Test',
  '  @TestSecurity(user = "runner", roles = {"qits:runner"})',
  '  void refusesAnotherRunsToken() {',
  '    String body = """',
  '        {"kind": "test-results", "kindVersion": 1, "payload": {}}',
  '        """;',
  '    given().header("X-Run-Token", OTHER_RUN_TOKEN).body(body)',
  '        .post("/ci/api/runs/{runId}/reports", RUN_ID)',
  '        .then().statusCode(403); // not 204: the token names another run',
  '    assertEquals(0L, reports.count(), "nothing was stored");',
  '  }',
];

const TYPESCRIPT = [
  "  it('reads nothing until a failure is opened', async () => {",
  '    const fixture = render([failure()]);',
  '    http.expectNone(() => true);',
  '    open(fixture, 0);',
  '    const read = http.expectOne((r) => /\\/file$/.test(r.url));',
  "    expect(read.request.params.get('path')).toBe(`${dir}/CiReportResourceTest.java`);",
  '    /* the file is read once,',
  '       however often it is opened */',
  '    read.flush({ path: FILE, binary: false, size: 0x200, content: source(10) });',
  '  });',
];

const meta: Meta<QitsCodeExcerpt> = {
  title: 'Failures/Code excerpt',
  component: QitsCodeExcerpt,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideQitsSyntaxHighlighter(new JavaHighlighter()),
        provideQitsSyntaxHighlighter(new TypeScriptHighlighter()),
      ],
    }),
  ],
  args: { lines: JAVA, firstLine: 84, language: 'java' },
};

export default meta;
type Story = StoryObj<QitsCodeExcerpt>;

/**
 * A surefire test's lines, numbered as they stand in the file: an annotation with arguments, a
 * block comment and a text block that span lines, and a line long enough to scroll inside the box.
 */
export const Java: Story = {};

/** A vitest spec: a template literal with a `${}` hole, a regex literal and a block comment. */
export const TypeScript: Story = {
  name: 'TypeScript',
  args: { lines: TYPESCRIPT, firstLine: 120, language: 'typescript' },
};

/** A language with no registered highlighter: the lines, plain and still numbered. */
export const Plain: Story = {
  name: 'A language with no highlighter',
  args: {
    lines: ['class KotlinSpec : StringSpec({', '  "adds numbers" { (1 + 2) shouldBe 4 }', '})'],
    firstLine: 12,
    language: 'kotlin',
  },
};

/** The same Java on a page that declares `color-scheme: dark`: the dark set of token colours. */
export const Dark: Story = {
  name: 'Java, dark',
  decorators: [
    (story) => ({
      ...story(),
      styles: [':host { display: block; color-scheme: dark; background: #030712; padding: 1rem; }'],
    }),
  ],
};
