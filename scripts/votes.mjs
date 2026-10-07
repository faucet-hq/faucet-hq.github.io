// Writes votes.json ({ votes: { "<page term>": count } }) from the giscus discussions of the blog and papers.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OWNER = 'faucet-hq';
const NAME = 'faucet-hq.github.io';
const CATEGORY = 'Announcements';

export function score(node) {
  const up = Math.max(0, node.upvoteCount || 0);
  const thumbs = (node.reactionGroups || []).find((g) => g.content === 'THUMBS_UP');
  return up + Math.max(0, thumbs?.reactors?.totalCount || 0);
}

export function tally(nodes) {
  const votes = {};
  for (const n of nodes) {
    const term = (n.title || '').trim();
    if (!/^(blog|papers)\/[a-z0-9-]+$/.test(term)) continue;
    votes[term] = (votes[term] || 0) + score(n);
  }
  return Object.fromEntries(Object.entries(votes).filter(([, v]) => v > 0).sort(([a], [b]) => a.localeCompare(b)));
}

async function gql(token, query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`GitHub GraphQL ${r.status}: ${await r.text()}`);
  const body = await r.json();
  if (body.errors) throw new Error(`GitHub GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data;
}

async function fetchNodes(token) {
  const cats = await gql(
    token,
    'query($o:String!,$n:String!){repository(owner:$o,name:$n){discussionCategories(first:50){nodes{id name}}}}',
    { o: OWNER, n: NAME },
  );
  const cat = cats.repository.discussionCategories.nodes.find((c) => c.name === CATEGORY);
  if (!cat) throw new Error(`no '${CATEGORY}' discussion category in ${OWNER}/${NAME}`);
  const nodes = [];
  let after = null;
  for (;;) {
    const d = await gql(
      token,
      `query($o:String!,$n:String!,$c:ID!,$a:String){repository(owner:$o,name:$n){
         discussions(first:100,categoryId:$c,after:$a){pageInfo{hasNextPage endCursor}
           nodes{title upvoteCount reactionGroups{content reactors{totalCount}}}}}}`,
      { o: OWNER, n: NAME, c: cat.id, a: after },
    );
    const page = d.repository.discussions;
    nodes.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return nodes;
    after = page.pageInfo.endCursor;
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const out = process.argv[2] || 'votes.json';
  const votes = tally(await fetchNodes(token));
  writeFileSync(out, JSON.stringify({ votes }, null, 2) + '\n');
  console.log(`wrote ${out}: ${Object.keys(votes).length} pages with votes`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
