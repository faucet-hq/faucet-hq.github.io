import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voters, tally } from './votes.mjs';

const r = (content, login) => ({ content, user: login ? { login } : null });

test('voters counts each account once across thumbs-up, heart and rocket only', () => {
  const v = voters([
    r('THUMBS_UP', 'ann'), r('HEART', 'ann'), r('ROCKET', 'ann'),
    r('ROCKET', 'bob'), r('THUMBS_DOWN', 'cat'), r('EYES', 'dan'), r('HEART', null),
  ]);
  assert.deepEqual([...v].sort(), ['ann', 'bob']);
  assert.equal(voters([]).size, 0);
  assert.equal(voters(undefined).size, 0);
});

test('tally keys counts by page term and drops unrelated or zero-vote threads', () => {
  const votes = tally([
    { title: 'papers/crash-safe-cdc', reactions: [r('HEART', 'ann')] },
    { title: 'blog/flat-memory', reactions: [r('THUMBS_UP', 'ann'), r('ROCKET', 'bob')] },
    { title: 'blog/the-value-tax', reactions: [r('THUMBS_DOWN', 'ann')] },
    { title: 'Welcome to Discussions!', reactions: [r('THUMBS_UP', 'ann')] },
    { title: 'dev/blog/flat-memory', reactions: [r('THUMBS_UP', 'cat')] },
  ]);
  assert.deepEqual(votes, { 'blog/flat-memory': 2, 'papers/crash-safe-cdc': 1 });
  assert.deepEqual(Object.keys(votes), ['blog/flat-memory', 'papers/crash-safe-cdc']);
});

test('tally counts an account once across duplicate threads for the same page', () => {
  assert.deepEqual(
    tally([
      { title: 'blog/write-modes', reactions: [r('THUMBS_UP', 'ann')] },
      { title: ' blog/write-modes ', reactions: [r('HEART', 'ann'), r('ROCKET', 'bob')] },
    ]),
    { 'blog/write-modes': 2 },
  );
});
