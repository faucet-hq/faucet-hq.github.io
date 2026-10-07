// Writes votes.json ({ votes: { "<page term>": count } }) from the giscus discussions of the blog and papers.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OWNER = 'faucet-hq';
const NAME = 'faucet-hq.github.io';
const CATEGORY = 'Announcements';

const STAR_REACTIONS = new Set(['THUMBS_UP', 'HEART', 'ROCKET']);

export function voters(reactions) {
  const logins = new Set();
  for (const r of reactions || []) {
    if (STAR_REACTIONS.has(r.content) && r.user?.login) logins.add(r.user.login);
  }
  return logins;
}

export function tally(nodes) {
  const byTerm = {};
  for (const n of nodes) {
    const term = (n.title || '').trim();
    if (!/^(blog|papers)\/[a-z0-9-]+$/.test(term)) continue;
    byTerm[term] ??= new Set();
    for (const login of voters(n.reactions)) byTerm[term].add(login);
  }
  return Object.fromEntries(
    Object.entries(byTerm)
      .map(([t, s]) => [t, s.size])
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
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

async function allReactions(token, node) {
  let page = node.reactions;
  const out = [...page.nodes];
  while (page.pageInfo.hasNextPage) {
    const d = await gql(
      token,
      `query($id:ID!,$a:String){node(id:$id){... on Discussion{
         reactions(first:100,after:$a){pageInfo{hasNextPage endCursor} nodes{content user{login}}}}}}`,
      { id: node.id, a: page.pageInfo.endCursor },
    );
    page = d.node.reactions;
    out.push(...page.nodes);
  }
  return out;
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
           nodes{id title reactions(first:100){pageInfo{hasNextPage endCursor} nodes{content user{login}}}}}}}`,
      { o: OWNER, n: NAME, c: cat.id, a: after },
    );
    const page = d.repository.discussions;
    for (const n of page.nodes) nodes.push({ title: n.title, reactions: await allReactions(token, n) });
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
