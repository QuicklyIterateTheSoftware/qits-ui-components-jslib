import { TestBed } from '@angular/core/testing';
import { mount } from '../../testing/browser/mount';
import { QitsCodeExcerpt } from './code-excerpt';
import { JavaHighlighter, provideQitsSyntaxHighlighter, TypeScriptHighlighter } from './syntax';

/** Screenshots of a code excerpt: highlighted Java and TypeScript, and a language with no highlighter. */
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

const STYLE = 'display: block; padding: 8px; width: 760px';

describe('QitsCodeExcerpt (screenshots)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideQitsSyntaxHighlighter(new JavaHighlighter()),
        provideQitsSyntaxHighlighter(new TypeScriptHighlighter()),
      ],
    });
  });

  it('highlights Java', async () => {
    const { view } = await mount(
      QitsCodeExcerpt,
      { lines: JAVA, firstLine: 84, language: 'java' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('java', { kind: 'DATA' });
  });

  it('highlights TypeScript', async () => {
    const { view } = await mount(
      QitsCodeExcerpt,
      { lines: TYPESCRIPT, firstLine: 120, language: 'typescript' },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('typescript', { kind: 'DATA' });
  });

  it('shows a language with no highlighter plain', async () => {
    const { view } = await mount(
      QitsCodeExcerpt,
      {
        lines: ['class KotlinSpec : StringSpec({', '  "adds numbers" { (1 + 2) shouldBe 4 }', '})'],
        firstLine: 12,
        language: 'kotlin',
      },
      STYLE,
    );
    await expect.element(view()).toMatchScreenshot('plain', { kind: 'DATA' });
  });
});
