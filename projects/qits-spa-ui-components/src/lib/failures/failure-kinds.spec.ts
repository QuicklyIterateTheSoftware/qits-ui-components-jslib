import type { QitsTestFailure } from '../test-results-report';
import {
  classifyFailure,
  StandardFailureClassifier,
  type QitsFailureClassifier,
} from './failure-kinds';
import failsafeError from './fixtures/failures/failsafe-error.json';
import kotestUnknown from './fixtures/failures/kotest-unknown.json';
import surefireAssertion from './fixtures/failures/surefire-assertion.json';
import vitestSetup from './fixtures/failures/vitest-setup.json';
import vitestTimeout from './fixtures/failures/vitest-timeout.json';

const standard = new StandardFailureClassifier();

describe('StandardFailureClassifier', () => {
  it.each([
    ['surefire assertion', surefireAssertion, 'java', 'surefire', 'ASSERTION'],
    ['failsafe error', failsafeError, 'java', 'failsafe', 'ERROR'],
    ['vitest timeout', vitestTimeout, 'typescript', 'vitest', 'TIMEOUT'],
    ['vitest setup', vitestSetup, 'typescript', 'vitest', 'SETUP'],
  ])('classifies the recorded %s', (_name, failure, language, tool, shape) => {
    expect(standard.classify(failure as QitsTestFailure)).toEqual({
      language,
      tool,
      shape,
      category: shape.toLowerCase(),
    });
  });

  it('declines a language or tool it was never taught', () => {
    expect(standard.classify(kotestUnknown as QitsTestFailure)).toBeNull();
    const jest = {
      ...vitestTimeout,
      coordinates: { ...vitestTimeout.coordinates, tool: 'jest' },
    } as QitsTestFailure;
    expect(standard.classify(jest)).toBeNull();
  });

  it('answers for javascript under vitest too', () => {
    const js = {
      ...vitestTimeout,
      coordinates: { ...vitestTimeout.coordinates, language: 'javascript' },
    } as QitsTestFailure;
    expect(standard.classify(js)?.category).toBe('timeout');
  });
});

describe('classifyFailure', () => {
  const kotlin: QitsFailureClassifier = {
    id: 'kotlin',
    classify: (failure) =>
      failure.coordinates.language === 'kotlin'
        ? { language: 'kotlin', tool: 'kotest', shape: failure.shape, category: 'kotest' }
        : null,
  };
  const throwing: QitsFailureClassifier = {
    id: 'broken',
    classify: () => {
      throw new Error('broken classifier');
    },
  };
  const greedy: QitsFailureClassifier = {
    id: 'greedy',
    classify: (failure) => ({ language: 'any', tool: 'any', shape: failure.shape, category: 'x' }),
  };

  it('is null for an unknown failure, and with no classifiers at all', () => {
    expect(classifyFailure([standard], kotestUnknown as QitsTestFailure)).toBeNull();
    expect(classifyFailure([], surefireAssertion as QitsTestFailure)).toBeNull();
    expect(classifyFailure(null, surefireAssertion as QitsTestFailure)).toBeNull();
  });

  it('asks in registration order and takes the first answer', () => {
    expect(classifyFailure([standard, greedy], surefireAssertion as QitsTestFailure)?.tool).toBe(
      'surefire',
    );
    expect(classifyFailure([greedy, standard], surefireAssertion as QitsTestFailure)?.tool).toBe(
      'any',
    );
    expect(classifyFailure([standard, kotlin], kotestUnknown as QitsTestFailure)?.category).toBe(
      'kotest',
    );
  });

  it('skips a classifier that throws', () => {
    expect(classifyFailure([throwing, standard], failsafeError as QitsTestFailure)).toEqual({
      language: 'java',
      tool: 'failsafe',
      shape: 'ERROR',
      category: 'error',
    });
    expect(classifyFailure([throwing], failsafeError as QitsTestFailure)).toBeNull();
  });
});
