import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, tally } from './votes.mjs';

const groups = (thumbs, heart = 0, down = 0) => [
  { content: 'THUMBS_UP', reactors: { totalCount: thumbs } },
  { content: 'HEART', reactors: { totalCount: heart } },
  { content: 'THUMBS_DOWN', reactors: { totalCount: down } },
];

test('score adds thumbs-up reactions to upvotes and ignores other reactions', () => {
  assert.equal(score({ upvoteCount: 2, reactionGroups: groups(3, 5, 9) }), 5);
  assert.equal(score({ upvoteCount: 0, reactionGroups: [] }), 0);
  assert.equal(score({}), 0);
  assert.equal(score({ upvoteCount: -1, reactionGroups: [{ content: 'THUMBS_UP' }] }), 0);
});

test('tally keys counts by page term and drops unrelated or zero-vote threads', () => {
  const votes = tally([
    { title: 'papers/crash-safe-cdc', upvoteCount: 1, reactionGroups: groups(0) },
    { title: 'blog/flat-memory', upvoteCount: 0, reactionGroups: groups(2) },
    { title: 'blog/the-value-tax', upvoteCount: 0, reactionGroups: groups(0) },
    { title: 'Welcome to Discussions!', upvoteCount: 4, reactionGroups: groups(4) },
    { title: 'dev/blog/flat-memory', upvoteCount: 1, reactionGroups: groups(1) },
  ]);
  assert.deepEqual(votes, { 'blog/flat-memory': 2, 'papers/crash-safe-cdc': 1 });
  assert.deepEqual(Object.keys(votes), ['blog/flat-memory', 'papers/crash-safe-cdc']);
});

test('tally merges duplicate threads for the same page', () => {
  assert.deepEqual(
    tally([
      { title: 'blog/write-modes', upvoteCount: 1, reactionGroups: groups(0) },
      { title: ' blog/write-modes ', upvoteCount: 0, reactionGroups: groups(2) },
    ]),
    { 'blog/write-modes': 3 },
  );
});
