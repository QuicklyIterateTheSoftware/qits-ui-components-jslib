/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Via } from '@qits/angular/testing';

/** The repository this library is built in, as a pact's `qits-via.repository` names it. */
export const UI_COMPONENTS_REPOSITORY = 'qits-ui-components-jslib';

/** The package a consumer installs, as a pact's `qits-via.artifact` names it. */
export const UI_COMPONENTS_ARTIFACT = '@qits/ui-components';

/**
 * The library every call of this entry point goes through, as `comments.references.qits-via` names
 * it (ticket qits-1284): this repository, this package, and **the version the consumer resolves**.
 *
 * The version is read at test time from the consumer's own `node_modules/@qits/ui-components/
 * package.json`, looked up from `from` (default: the cwd) upwards the way `goldenMasters` finds a
 * provider's package. It is the version the SPA pins, so a qits-maintenance bump of the library
 * changes the label and nothing else — which the committed-pact comparison treats as a refresh,
 * not a contract change.
 */
export function uiComponentsVia(from: string = process.cwd()): Via {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', UI_COMPONENTS_ARTIFACT, 'package.json');
    if (existsSync(manifest)) {
      const { name, version } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (name !== UI_COMPONENTS_ARTIFACT || !version) {
        throw new Error(`${manifest} names ${name}@${version}, not a ${UI_COMPONENTS_ARTIFACT}`);
      }
      return { repository: UI_COMPONENTS_REPOSITORY, artifact: UI_COMPONENTS_ARTIFACT, version };
    }
    if (dirname(dir) === dir) {
      throw new Error(`no ${UI_COMPONENTS_ARTIFACT} in any node_modules above ${from}: run npm ci`);
    }
  }
}
