import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QITS_NAVIGATION, toNavTree, type QitsNavTree } from './navigation';
import { provideQitsProjects, QITS_PROJECTS, QITS_PROJECTS_URL } from './projects';
import { QITS_REPOSITORIES, QITS_REPOSITORIES_URL } from './repositories';
import { QITS_SCOPE, type QitsScopeSource } from './scope';

describe('provideQitsProjects across origins', () => {
  const ORIGINS = {
    slots: {},
    applications: { 'qits-projects': { origin: 'https://projects.qits.example' } },
  };
  let tree: WritableSignal<QitsNavTree | undefined>;
  let projectId: WritableSignal<string | undefined>;

  function setup(options?: { readonly url?: string }): void {
    tree = signal<QitsNavTree | undefined>(undefined);
    projectId = signal<string | undefined>(undefined);
    const scope: Partial<QitsScopeSource> = { projectId, routing: 'repository' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QITS_NAVIGATION, useValue: { tree, failed: signal(false) } },
        { provide: QITS_SCOPE, useValue: scope },
        provideQitsProjects(options),
      ],
    });
    TestBed.inject(QITS_PROJECTS);
    TestBed.inject(QITS_REPOSITORIES);
    TestBed.tick();
  }

  function http(): HttpTestingController {
    return TestBed.inject(HttpTestingController);
  }

  it('asks nothing before the navigation says where qits-projects is', () => {
    setup();
    projectId.set('p1');
    TestBed.tick();
    http().verify();
  });

  it('asks qits-projects on its own origin, with the session, once it is known', () => {
    setup();
    projectId.set('p1');
    tree.set(toNavTree(ORIGINS));
    TestBed.tick();

    const list = http().expectOne(`https://projects.qits.example${QITS_PROJECTS_URL}`);
    expect(list.request.withCredentials).toBe(true);
    list.flush({ entries: [{ project: { id: 'p1', slug: 'qits', name: 'qits' } }] });
    expect(TestBed.inject(QITS_PROJECTS).projects()).toHaveLength(1);

    const repositories = http().expectOne(
      `https://projects.qits.example${QITS_REPOSITORIES_URL}/p1/repositories`,
    );
    expect(repositories.request.withCredentials).toBe(true);
  });

  it('keeps the same-origin path where the navigation names no origin for qits-projects', () => {
    setup();
    tree.set(toNavTree({ slots: {} }));
    TestBed.tick();
    http().expectOne(QITS_PROJECTS_URL);
  });

  it('uses a url it was given exactly as given, without waiting', () => {
    setup({ url: '/fixture/projects' });
    http().expectOne('/fixture/projects');
  });
});
