import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { QitsReportContext } from '../reports';
import type { QitsTestFailure } from '../test-results-report';
import {
  provideQitsFailureClassifier,
  StandardFailureClassifier,
  type QitsFailureKind,
} from './failure-kinds';
import {
  provideQitsFailureInsight,
  QITS_FAILURE_ACTIONS,
  type QitsFailureActionProvider,
} from './failure-insights';
import { QitsFailureInsightsArea } from './failure-insights-area';
import kotestUnknown from './fixtures/failures/kotest-unknown.json';
import surefireAssertion from './fixtures/failures/surefire-assertion.json';

const KOTEST = kotestUnknown as QitsTestFailure;
const SUREFIRE = surefireAssertion as QitsTestFailure;

const CONTEXT: QitsReportContext = {
  runId: 'run-1',
  commitSha: 'abc1234',
  baseline: null,
  ciOrigin: '',
};

@Component({
  selector: 'qits-spec-kotest-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="kotest"
    >{{ failure().coordinates.testName }} as {{ kind().category }} in {{ context()?.runId }}</span
  >`,
})
class KotestInsight {
  readonly failure = input.required<QitsTestFailure>();
  readonly kind = input.required<QitsFailureKind>();
  readonly context = input<QitsReportContext | null>(null);
}

/** Declares only `failure`: the area hands it nothing else, and that is not an error. */
@Component({
  selector: 'qits-spec-shape-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="shape">{{ failure().shape }}</span>`,
})
class ShapeInsight {
  readonly failure = input.required<QitsTestFailure>();
}

@Component({
  selector: 'qits-spec-exploding-insight',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="exploded">never</span>`,
})
class ExplodingInsight {
  constructor() {
    throw new Error('this insight cannot render');
  }
}

const kotlinClassifier = provideQitsFailureClassifier({
  id: 'kotlin',
  classify: (failure) =>
    failure.coordinates.language === 'kotlin'
      ? { language: 'kotlin', tool: 'kotest', shape: failure.shape, category: 'kotest-assertion' }
      : null,
});

const kotestInsight = provideQitsFailureInsight({
  id: 'kotest',
  title: 'Kotest',
  appliesTo: (kind) => kind.language === 'kotlin',
  component: KotestInsight,
});

function render(
  failure: QitsTestFailure,
  context: QitsReportContext | null = CONTEXT,
): ComponentFixture<QitsFailureInsightsArea> {
  const fixture = TestBed.createComponent(QitsFailureInsightsArea);
  fixture.componentRef.setInput('failure', failure);
  fixture.componentRef.setInput('context', context);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('QitsFailureInsightsArea', () => {
  it('draws a registered classifier’s failure with a registered insight, and nothing else needed', () => {
    TestBed.configureTestingModule({ providers: [kotlinClassifier, kotestInsight] });
    const fixture = render(KOTEST);
    expect(host(fixture).querySelector('.insight .title')?.textContent).toBe('Kotest');
    expect(host(fixture).querySelector('.kotest')?.textContent).toBe(
      'adds numbers as kotest-assertion in run-1',
    );
  });

  it('draws nothing at all for an unclassified failure', () => {
    TestBed.configureTestingModule({ providers: [kotestInsight] });
    const fixture = render(KOTEST);
    expect(host(fixture).children).toHaveLength(0);
    expect(host(fixture).textContent?.trim()).toBe('');
  });

  it('draws only the insights that apply, in registration order', () => {
    TestBed.configureTestingModule({
      providers: [
        provideQitsFailureClassifier(new StandardFailureClassifier()),
        kotlinClassifier,
        kotestInsight,
        provideQitsFailureInsight({
          id: 'shape',
          title: 'Shape',
          appliesTo: () => true,
          component: ShapeInsight,
        }),
      ],
    });
    const fixture = render(SUREFIRE);
    expect(
      [...host(fixture).querySelectorAll('.insight .title')].map((t) => t.textContent),
    ).toEqual(['Shape']);
    expect(host(fixture).querySelector('.shape')?.textContent).toBe('ASSERTION');
  });

  it('degrades an insight whose appliesTo throws, or whose component does, to a muted line', () => {
    TestBed.configureTestingModule({
      providers: [
        kotlinClassifier,
        provideQitsFailureInsight({
          id: 'judging',
          title: 'Judging',
          appliesTo: () => {
            throw new Error('cannot judge');
          },
          component: ShapeInsight,
        }),
        provideQitsFailureInsight({
          id: 'exploding',
          title: 'Exploding',
          appliesTo: () => true,
          component: ExplodingInsight,
        }),
        kotestInsight,
      ],
    });
    const fixture = render(KOTEST);
    expect(
      [...host(fixture).querySelectorAll('.broken')].map((line) => line.textContent?.trim()),
    ).toEqual(['Judging could not be shown.', 'Exploding could not be shown.']);
    expect(host(fixture).querySelector('.exploded')).toBeNull();
    expect(host(fixture).querySelector('.kotest')).not.toBeNull();
  });

  it('has no actions by default, and draws no action row', () => {
    TestBed.configureTestingModule({ providers: [kotlinClassifier, kotestInsight] });
    expect(TestBed.inject(QITS_FAILURE_ACTIONS)).toEqual([]);
    expect(host(render(KOTEST)).querySelector('.actions')).toBeNull();
  });

  it('draws a registered action’s button only where it applies, and runs it', async () => {
    const runs: [QitsTestFailure, QitsReportContext][] = [];
    const rerun: QitsFailureActionProvider = {
      id: 'rerun',
      label: 'Rerun this test',
      appliesTo: (kind) => kind.language === 'kotlin',
      run: async (failure, context) => {
        runs.push([failure, context]);
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideQitsFailureClassifier(new StandardFailureClassifier()),
        kotlinClassifier,
        { provide: QITS_FAILURE_ACTIONS, useValue: rerun, multi: true },
      ],
    });
    expect(host(render(SUREFIRE)).querySelector('.actions')).toBeNull();

    const fixture = render(KOTEST);
    const button = host(fixture).querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent?.trim()).toBe('Rerun this test');
    button!.click();
    await Promise.resolve();
    expect(runs).toEqual([[KOTEST, CONTEXT]]);
  });
});
