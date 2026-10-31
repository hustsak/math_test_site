// Tests for single-use student invite links (a forwarded link must error). Run: npm run test:link
// Needs Node 22.18+ (imports the TypeScript source directly, no build step).
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The app imports './x' without an extension (Next.js style); plain Node needs one.
const lib = new URL('../src/lib/', import.meta.url);
const tmp = mkdtempSync(join(tmpdir(), 'student-link-test-'));
cpSync(new URL('tokens.ts', lib), join(tmp, 'tokens.ts'));
for (const f of ['studentInvite.ts', 'studentInviteStore.ts']) {
  writeFileSync(
    join(tmp, f),
    readFileSync(new URL(f, lib), 'utf8').replace("from './tokens'", "from './tokens.ts'").replace("from './studentInvite'", "from './studentInvite.ts'"),
  );
}
const load = (f) => import(pathToFileURL(join(tmp, f)).href);
const inv = await load('studentInvite.ts');
const { firestoreInviteStore } = await load('studentInviteStore.ts');
const { generateToken } = await load('tokens.ts');

// ---- A small in-memory stand-in for the Firestore calls the store uses.
function fakeDb() {
  const data = new Map();
  let lock = Promise.resolve();
  const snap = (key) => ({ exists: data.has(key), id: key.split('/')[1], data: () => structuredClone(data.get(key)) });
  const docRef = (col, id) => ({
    key: `${col}/${id}`,
    get: async () => snap(`${col}/${id}`),
    set: async (v) => void data.set(`${col}/${id}`, structuredClone(v)),
  });
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    where: (field, _op, value) => ({
      get: async () => ({
        docs: [...data.entries()].filter(([k, o]) => k.startsWith(col + '/') && o[field] === value).map(([k]) => snap(k)),
      }),
    }),
  });
  // Transactions run one at a time, like Firestore's retry-on-conflict result.
  const runTransaction = (fn) => {
    const run = async () => {
      const writes = [];
      const tx = {
        get: async (r) => snap(r.key),
        update: (r, v) => writes.push(() => data.set(r.key, { ...data.get(r.key), ...structuredClone(v) })),
        set: (r, v) => writes.push(() => data.set(r.key, structuredClone(v))),
      };
      const out = await fn(tx);
      writes.forEach((w) => w());
      return out;
    };
    const p = lock.then(run, run);
    lock = p.catch(() => {});
    return p;
  };
  const batch = () => {
    const ops = [];
    return { delete: (r) => ops.push(() => data.delete(r.key)), commit: async () => ops.forEach((o) => o()) };
  };
  return { collection, runTransaction, batch, data };
}

const db = fakeDb();
const store = firestoreInviteStore(db);

// Two students, each with their own link token.
const students = {
  alice: { id: 'alice', token: generateToken(24) },
  bob: { id: 'bob', token: generateToken(24) },
};
const getStudentToken = async (id) => Object.values(students).find((s) => s.id === id)?.token ?? null;
const cookieOf = (setCookie) => `${setCookie.name}=${encodeURIComponent(setCookie.value)}`;
const open = (inviteToken, cookieHeader = '', now) => inv.openInvite(store, { inviteToken, cookieHeader, getStudentToken, now });
const allowed = (who, cookieHeader, student = { linkLocked: true }) =>
  inv.canAccessStudentLink(store, { student, studentId: who.id, studentToken: who.token, cookieHeader });

// ============================================================ 1. the main scenario
// Teacher copies Alice's link and sends it to Alice.
const { inviteToken, expiresAt } = await inv.createInvite(store, 'alice');
assert.equal(inviteToken.length, 32);
assert.ok(expiresAt > Date.now());
// Only hashes are stored, never the token.
assert.ok(![...db.data.keys()].some((k) => k.includes(inviteToken)));
assert.ok(!JSON.stringify([...db.data.values()]).includes(inviteToken));

// Alice opens it on her phone: unlocked, sent on to her portal, invite token not in that URL.
const aliceOpen = await open(inviteToken);
assert.equal(aliceOpen.action, 'redirect');
assert.equal(aliceOpen.studentToken, students.alice.token);
assert.ok(aliceOpen.setCookie);
assert.equal(aliceOpen.setCookie.name, inv.sessionCookieName(students.alice.token));
assert.equal(aliceOpen.setCookie.maxAge, inv.SESSION_MAX_AGE_S);
const alicePhone = cookieOf(aliceOpen.setCookie);
assert.ok(!aliceOpen.studentToken.includes(inviteToken));
// Session secret itself is not stored either.
assert.ok(!JSON.stringify([...db.data.values()]).includes(aliceOpen.setCookie.value));

// Alice's phone can use her portal.
assert.equal(await allowed(students.alice, alicePhone), true);

// Alice FORWARDS THE INVITE LINK to a friend: the invite is already used -> error.
const friendOpen = await open(inviteToken);
assert.deepEqual(friendOpen, { action: 'error', reason: 'used' });

// Alice instead copies her address-bar URL /s/<token> and sends that: the friend has no cookie -> error.
assert.equal(await allowed(students.alice, ''), false);
assert.equal(await allowed(students.alice, 'theme=dark; other=1'), false);

// The friend is another student with a valid session of their own: still not Alice.
const bobInvite = await inv.createInvite(store, 'bob');
const bobOpen = await open(bobInvite.inviteToken);
const bobPhone = cookieOf(bobOpen.setCookie);
assert.equal(await allowed(students.bob, bobPhone), true);
assert.equal(await allowed(students.alice, bobPhone), false); // wrong cookie name for Alice
// Even copying Bob's secret into Alice's cookie name fails (session belongs to bob).
assert.equal(await allowed(students.alice, `${aliceOpen.setCookie.name}=${encodeURIComponent(bobOpen.setCookie.value)}`), false);
// Garbage / short / forged values fail.
assert.equal(await allowed(students.alice, `${aliceOpen.setCookie.name}=abc`), false);
assert.equal(await allowed(students.alice, `${aliceOpen.setCookie.name}=${generateToken(32)}`), false);

// ============================================================ 2. same browser re-open is fine
// Refresh / back button on the invite URL in Alice's own browser: goes to the portal, no error.
const again = await open(inviteToken, alicePhone);
assert.equal(again.action, 'redirect');
assert.equal(again.studentToken, students.alice.token);
assert.equal(again.setCookie, undefined); // no new session minted

// ============================================================ 3. second device needs a new invite
const second = await inv.createInvite(store, 'alice');
const aliceLaptop = cookieOf((await open(second.inviteToken)).setCookie);
assert.equal(await allowed(students.alice, aliceLaptop), true);
assert.equal(await allowed(students.alice, alicePhone), true); // phone still works

// ============================================================ 4. regenerating the link cuts everyone off
const oldToken = students.alice.token;
students.alice.token = generateToken(24); // what "Regenerate link" does
assert.equal(await allowed(students.alice, alicePhone), false);
assert.equal(await allowed(students.alice, aliceLaptop), false);
assert.notEqual(inv.sessionCookieName(oldToken), inv.sessionCookieName(students.alice.token));

// ============================================================ 5. students never locked keep working
assert.equal(await allowed(students.bob, '', { linkLocked: false }), true);
assert.equal(await allowed(students.bob, '', {}), true);
assert.equal(await allowed(students.bob, '', null), true);
assert.equal(await allowed(students.bob, '', { linkLocked: 'yes' }), true); // only strict `true` locks
assert.equal(inv.isLinkLocked({ linkLocked: true }), true);

// ============================================================ 6. expiry, bad and unknown tokens
const old = await inv.createInvite(store, 'bob', 1_000_000);
assert.deepEqual(await open(old.inviteToken, '', old.expiresAt + 1), { action: 'error', reason: 'expired' });
assert.equal((await open(old.inviteToken, '', old.expiresAt - 1)).action, 'redirect'); // still valid just before expiry
assert.deepEqual(await open('short'), { action: 'error', reason: 'invalid' });
assert.deepEqual(await open('x'.repeat(40)), { action: 'error', reason: 'invalid' }); // unknown
assert.deepEqual(await open('bad token with spaces!!!!!!!!!!!'), { action: 'error', reason: 'invalid' });
// Invite of a deleted student is an error, and nothing is consumed.
const ghost = await inv.createInvite(store, 'ghost');
assert.deepEqual(await open(ghost.inviteToken), { action: 'error', reason: 'invalid' });
assert.equal((await store.getInvite(inv.sha256Hex(ghost.inviteToken))).usedAt, null);

// ============================================================ 7. two people open at the same moment
const race = await inv.createInvite(store, 'bob');
const results = await Promise.all(Array.from({ length: 6 }, () => open(race.inviteToken)));
assert.equal(results.filter((r) => r.action === 'redirect').length, 1, 'exactly one browser wins the invite');
assert.equal(results.filter((r) => r.action === 'error' && r.reason === 'used').length, 5);

// ============================================================ 8. at most MAX devices per student
const carol = { id: 'carol', token: generateToken(24) };
students.carol = carol;
const cookies = [];
for (let i = 0; i < inv.MAX_SESSIONS_PER_STUDENT + 3; i++) {
  const c = await inv.createInvite(store, 'carol');
  cookies.push(cookieOf((await open(c.inviteToken, '', Date.now() + i)).setCookie));
}
assert.equal((await store.listSessions('carol')).length, inv.MAX_SESSIONS_PER_STUDENT);
assert.equal(await allowed(carol, cookies[cookies.length - 1]), true); // newest always survives
assert.equal(await allowed(carol, cookies[0]), false); // oldest dropped

// ============================================================ 9. link-preview robots must not burn an invite
const humans = [
  'Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 12; V2120) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0;]', // Facebook in-app browser
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0',
];
const bots = [
  'TelegramBot (like TwitterBot)',
  'WhatsApp/2.23.20.0 A',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Twitterbot/1.0',
  'SkypeUriPreview Preview/0.5',
  '',
  undefined,
];
for (const ua of humans) assert.equal(inv.isPreviewBot(ua, 'GET'), false, `human UA treated as bot: ${ua}`);
for (const ua of bots) assert.equal(inv.isPreviewBot(ua, 'GET'), true, `bot UA not detected: ${ua}`);
assert.equal(inv.isPreviewBot(humans[0], 'HEAD'), true); // HEAD never consumes

// ============================================================ 10. cookie parsing
assert.deepEqual(inv.parseCookies('a=1; b=hello%20world; c="q"; bad; =x'), { a: '1', b: 'hello world', c: 'q' });
assert.deepEqual(inv.parseCookies(''), {});
assert.deepEqual(inv.parseCookies(null), {});
assert.deepEqual(inv.parseCookies('a=1; a=2'), { a: '1' }); // first one wins
assert.deepEqual(inv.parseCookies('a=%E0%A4%A'), { a: '%E0%A4%A' }); // malformed escape does not throw

console.log('All student single-use link checks passed.');
