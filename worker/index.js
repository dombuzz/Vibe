// Cloudflare Worker: ordnet Ohrmarkennummern Namen zu und speichert die Zuordnung
// als Textdatei (namen.txt, Zeilen "nummer;name;datum") im GitHub-Repo.
// Secret: GITHUB_TOKEN (fine-grained, nur Repo dombuzz/Vibe, Contents: Read and write)

const REPO = "dombuzz/Vibe";
const FILE = "namen.txt";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://cow.dombuzz.ch";
const MAX_ENTRIES = 5000;

const NAMES = ["Berta","Heidi","Vreni","Resli","Blüemli","Zita","Gretl","Lisi","Fleckli","Mona","Nelly","Stella","Sonja","Flurina","Mengia","Annatina","Cilgia","Selina","Uorschla","Gianna","Bella","Lilly","Rosa","Frieda","Marlis","Trudi","Elsi","Ida","Hanni","Gerda","Alma","Pia","Sabina","Luzia","Margritli","Edelweiss","Alpina","Gamsli","Murmeli","Chäsli","Rösli","Zottel","Bimba","Trina","Dorli","Christa","Sepp-Line","Glöggli","Nora","Cäcilia","Chatrina","Madlaina","Mia","Tilda","Wiesli","Brunhilde","Jolanda","Kunigunde","Greta","Olga"];

const api = (env, path, init = {}) =>
  fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ohrmarken-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });

const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
const enc = (txt) => { const b = new TextEncoder().encode(txt); let s = ""; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };

async function readFile(env) {
  const r = await api(env, `${FILE}?ref=${BRANCH}`);
  if (r.status === 404) return { text: "", sha: null };
  if (!r.ok) throw new Error("read " + r.status);
  const j = await r.json();
  return { text: dec(j.content), sha: j.sha };
}

function parse(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const [tag, name] = line.split(";");
    if (tag && name) map.set(tag.trim(), name.trim());
  }
  return map;
}

function pickName(map) {
  const used = new Set(map.values());
  const free = NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  const base = NAMES[Math.floor(Math.random() * NAMES.length)];
  let i = 2; while (used.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

async function lookup(env, tag) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text, sha } = await readFile(env);
    const map = parse(text);
    if (map.has(tag)) return { name: map.get(tag), isNew: false };
    if (map.size >= MAX_ENTRIES) throw new Error("full");
    const name = pickName(map);
    const line = `${tag};${name};${new Date().toISOString().slice(0, 10)}\n`;
    const body = { message: `Neue Ohrmarke ${tag}`, content: enc(text + line), branch: BRANCH };
    if (sha) body.sha = sha;
    const r = await api(env, FILE, { method: "PUT", body: JSON.stringify(body) });
    if (r.ok) return { name, isNew: true };
    if (r.status !== 409 && r.status !== 422) throw new Error("write " + r.status);
    // Konflikt (gleichzeitiger Schreibzugriff): neu lesen und erneut versuchen
  }
  throw new Error("conflict");
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (url.pathname !== "/lookup") return json({ error: "not found" }, 404);
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "forbidden" }, 403);
    const tag = (url.searchParams.get("tag") || "").replace(/\D/g, "");
    if (tag.length < 4 || tag.length > 20) return json({ error: "invalid tag" }, 400);
    try {
      return json(await lookup(env, tag));
    } catch (e) {
      return json({ error: "unavailable" }, 503);
    }
  },
};
