import { Component, input } from '@angular/core';

/* a block comment
   across two lines */
@Component({ selector: 'qits-spec', template: `<p>{{ label() }}</p>` })
class Spec {
  readonly label = input('');
}

const name = 'qits-ci';
const url = `${origin}/ci/api/runs/${encodeURIComponent(name)}/reports`;
const nested = `outer ${flag ? `inner ${count}` : 'none'} done`;
const multi = `first line
second ${value} line
third`;
const pattern = /^[a-z/]+\d{2,}$/gi;
const ratio = total / 2 / count;
// The door answers 403 to another run's token.
export async function read(limit = 0x1f, big = 10n): Promise<void> {
  return await fetch(url, { credentials: "include" }).then(() => undefined);
}
