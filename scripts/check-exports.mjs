import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// This library is registry-first: nothing installs the repo, so there is no root manifest to keep
// in sync with dist's. What can still go wrong is the *published* artifact — ng-packagr writes
// dist/package.json from projects/<lib>/package.json, and a manifest that names the wrong package,
// carries `private`, or points `exports` at files the build did not emit only fails at `npm
// publish` time, or worse, at a consumer's `import`. So this checks the thing being published.

const PROJECT = 'projects/qits-spa-ui-components/package.json';
const DIST = 'dist/qits-spa-ui-components';
const EXPECTED_NAME = '@qits/ui-components';

const project = JSON.parse(readFileSync(PROJECT, 'utf8'));
const dist = JSON.parse(readFileSync(`${DIST}/package.json`, 'utf8'));

let failed = false;
const fail = (message) => {
  console.error(message);
  failed = true;
};

if (dist.name !== EXPECTED_NAME) {
  fail(`name drift: dist declares ${dist.name}, this repo publishes ${EXPECTED_NAME}`);
}
if (dist.version !== project.version) {
  fail(`version drift: dist says ${dist.version}, ${PROJECT} says ${project.version}`);
}
// publish-if-absent reads the version out of PROJECT and npm reads it out of the tarball; a
// `private` flag would make the publish step fail after the whole pipeline had already gone green.
if (dist.private) {
  fail(`dist/package.json carries private: true — it would refuse to publish`);
}
for (const [pkg, range] of Object.entries(project.peerDependencies ?? {})) {
  if (dist.peerDependencies?.[pkg] !== range) {
    fail(
      `peer drift: ${PROJECT} declares ${pkg}@${range}, dist has ${dist.peerDependencies?.[pkg]}`,
    );
  }
}

// Every path the entry point advertises has to exist, or the package resolves to nothing.
const walk = (node, path) => {
  if (typeof node === 'string') {
    if (!existsSync(resolve(DIST, node))) {
      fail(`exports.${path} points at ${node}, which the build did not emit`);
    }
    return;
  }
  for (const [key, value] of Object.entries(node ?? {})) {
    walk(value, `${path}.${key}`);
  }
};
walk(dist.exports ?? {}, '');

// An optional peer that dist lists as required would have npm install pact and @qits/angular into
// every SPA's production tree, for a test helper.
for (const [pkg, meta] of Object.entries(project.peerDependenciesMeta ?? {})) {
  if (Boolean(dist.peerDependenciesMeta?.[pkg]?.optional) !== Boolean(meta?.optional)) {
    fail(`peer drift: ${PROJECT} says ${pkg} optional=${meta?.optional}, dist does not agree`);
  }
}

// The entry points a consumer imports, each with its types and its module. `./testing` is the
// consumer's pact helper (ticket qits-1284); `./package.json` is how that helper, running in the
// consumer, names the version of this package the consumer resolves.
for (const subpath of ['.', './testing']) {
  for (const condition of ['types', 'default']) {
    if (typeof dist.exports?.[subpath]?.[condition] !== 'string') {
      fail(`exports["${subpath}"].${condition} is missing: the entry point did not build`);
    }
  }
}
if (!dist.exports?.['./package.json']) {
  fail(`exports["./package.json"] is missing: a consumer could not resolve this package's version`);
}

// The testing entry point is Node-side and depends on its optional peers, never the reverse: the
// main bundle must not reach for pact, @qits/angular, node: builtins or the testing entry itself.
const main = dist.exports?.['.']?.default;
if (typeof main === 'string' && existsSync(resolve(DIST, main))) {
  const imports = [...readFileSync(resolve(DIST, main), 'utf8').matchAll(/from '([^']+)'/g)].map(
    (match) => match[1],
  );
  for (const forbidden of imports.filter((name) =>
    /^(node:|@pact-foundation\/|@qits\/angular|@qits\/ui-components\/testing|@angular\/core\/testing)/.test(
      name,
    ),
  )) {
    fail(`${main} imports ${forbidden}: only the ./testing entry point may`);
  }
}

if (failed) process.exit(1);
console.log(
  `publishable: ${dist.name}@${dist.version} in ${DIST} (exports resolve, ./testing built, not private)`,
);
