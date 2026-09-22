import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  provideQitsRepositories,
  provideQitsRepositoryList,
  QITS_REPOSITORIES,
  QITS_REPOSITORIES_URL,
  type QitsRepositoriesSource,
} from './repositories';
import { QITS_SCOPE, type QitsScopeSource } from './scope';

describe('provideQitsRepositories', () => {
  /**
   * The scope, reduced to the one thing this source reads. `equal: () => false` is what lets a spec
   * set the *same* project id again and prove the read is keyed on the id rather than on the write.
   */
  let projectId: WritableSignal<string | undefined>;

  function source(): QitsRepositoriesSource {
    projectId = signal<string | undefined>(undefined, { equal: () => false });
    const scope: Partial<QitsScopeSource> = { projectId, routing: 'repository' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_SCOPE, useValue: scope },
        provideQitsRepositories(),
      ],
    });
    const repositories = TestBed.inject(QITS_REPOSITORIES);
    TestBed.tick();
    return repositories;
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  function open(id: string | undefined): void {
    projectId.set(id);
    TestBed.tick();
  }

  it('asks nothing at all while no project is in scope', () => {
    const repositories = source();
    expect(repositories.repositories()).toBeUndefined();
    http().verify();
  });

  it('asks qits-projects for the scoped project, by id', () => {
    source();
    open('p1');
    http().expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`);
  });

  it('maps every archetype it groups, and keeps one it does not without a group', () => {
    const repositories = source();
    open('p1');
    http()
      .expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`)
      .flush({
        entries: [
          { repository: { id: 'r1', name: 'qits-ci', archetype: 'SERVICE' } },
          { repository: { id: 'r2', name: 'qits-agent', archetype: 'DAEMON' } },
          { repository: { id: 'r3', name: 'qits-eventstream', archetype: 'LIBRARY' } },
          // An APP is a standalone web application of its own; a FRONTEND is a microfrontend a
          // service carries inside its image. Two archetypes, two groups, side by side.
          { repository: { id: 'r4', name: 'qits-home-app', archetype: 'APP' } },
          { repository: { id: 'r5', name: 'qits-spa-home', archetype: 'FRONTEND' } },
          { repository: { id: 'r6', name: 'qits-cli-bootstrap', archetype: 'CLI' } },
          { repository: { id: 'r7', name: 'node-base', archetype: 'IMAGE' } },
          { repository: { id: 'r8', name: 'qits-qits', archetype: 'WRAPPER' } },
        ],
        wrapper: { repositoryId: 'r8', branch: 'main', entries: [] },
      });

    expect(repositories.repositories()?.map((entry) => entry.category)).toEqual([
      'services',
      'daemons',
      'libs',
      'apps',
      'frontends',
      'cli',
      'images',
      undefined,
    ]);
    expect(repositories.wrapperRepositoryId()).toBe('r8');
    expect(repositories.failed()).toBe(false);
  });

  /** A row carries a component only once the wrapper is reorganised, so all three shapes arrive. */
  it('takes the component where the row names one, and none where it does not', () => {
    const repositories = source();
    open('p1');
    http()
      .expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`)
      .flush({
        entries: [
          {
            repository: {
              id: 'r1',
              name: 'qits-ci-service',
              archetype: 'SERVICE',
              component: 'qits-ci',
            },
          },
          {
            repository: { id: 'r2', name: 'qits-ci-daemon', archetype: 'DAEMON', component: null },
          },
          { repository: { id: 'r3', name: 'qits-eventstream', archetype: 'LIBRARY' } },
        ],
      });

    expect(repositories.repositories()?.map((entry) => entry.component)).toEqual([
      'qits-ci',
      undefined,
      undefined,
    ]);
    // The archetype is still read: the sidebar's child entries hang off it, component or not.
    expect(repositories.repositories()?.map((entry) => entry.category)).toEqual([
      'services',
      'daemons',
      'libs',
    ]);
  });

  it('reads no wrapper as none, rather than as a failure', () => {
    const repositories = source();
    open('p1');
    http()
      .expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`)
      .flush({ entries: [], wrapper: null });
    expect(repositories.repositories()).toEqual([]);
    expect(repositories.wrapperRepositoryId()).toBeUndefined();
  });

  it('reads once per project, not once per navigation inside it', () => {
    source();
    open('p1');
    http().expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`).flush({ entries: [] });
    // The same project again — a hop between two of its pages writes the id afresh.
    open('p1');
    http().verify();
  });

  it('asks again when the project changes, and forgets the old answer meanwhile', () => {
    const repositories = source();
    open('p1');
    http()
      .expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`)
      .flush({ entries: [{ repository: { id: 'r1', name: 'qits-ci', archetype: 'SERVICE' } }] });
    expect(repositories.repositories()).toHaveLength(1);

    open('p2');
    // Pending again: the old project's repositories are not this project's.
    expect(repositories.repositories()).toBeUndefined();
    http().expectOne(`${QITS_REPOSITORIES_URL}/p2/repositories`);
  });

  it('cancels a read the reader has left behind', () => {
    source();
    open('p1');
    const request = http().expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`);
    open(undefined);
    expect(request.cancelled).toBe(true);
  });

  it('says the read failed rather than drawing a project with no repositories', () => {
    const repositories = source();
    open('p1');
    http()
      .expectOne(`${QITS_REPOSITORIES_URL}/p1/repositories`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });

    expect(repositories.repositories()).toEqual([]);
    expect(repositories.failed()).toBe(true);
  });
});

describe('provideQitsRepositoryList', () => {
  it('is answered from the moment it exists, with nothing to flush', () => {
    TestBed.configureTestingModule({
      providers: [
        provideQitsRepositoryList([{ id: 'r1', name: 'qits-ci', category: 'services' }], 'r9'),
      ],
    });
    const repositories = TestBed.inject(QITS_REPOSITORIES);
    expect(repositories.repositories()).toEqual([
      { id: 'r1', name: 'qits-ci', category: 'services' },
    ]);
    expect(repositories.wrapperRepositoryId()).toBe('r9');
    expect(repositories.failed()).toBe(false);
  });
});
