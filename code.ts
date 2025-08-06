// FillKit — AU dummy data filler: works on selected text (or text inside selected frames).
// Offline. Randomises on each click. Supports: names, addresses, phones, emails, business, dates, status.

figma.showUI(__html__, { width: 320, height: 500 });

type FontNameLike = FontName | PluginAPI['mixed'];

// ---------- Data ----------
const FIRST_NAMES = [
  "Jack","Olivia","William","Charlotte","Noah","Amelia","James","Isla","Thomas","Mia",
  "Lucas","Ava","Henry","Grace","Leo","Ella","Harrison","Sophie","Oscar","Evie",
  "Ethan","Zara","Liam","Ruby","Mason","Harper","George","Ivy","Samuel","Matilda",
  "Max","Hazel","Alexander","Poppy","Archie","Willow","Harry","Lucy","Daniel","Scarlett"
];

const LAST_NAMES = [
  "Smith","Jones","Williams","Brown","Taylor","Wilson","Martin","Anderson","Thomas","White",
  "Harris","Hall","Young","King","Wright","Walker","Scott","Green","Baker","Adams",
  "Mitchell","Campbell","Roberts","Turner","Phillips","Parker","Evans","Collins","Morris","Cooper",
  "Edwards","Miller","Davis","Clark","Allen","Reid","Kelly","Ward","Watson","Hughes"
];

const STATES = ["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"];

const STATUS_VALUES = ["Draft","In Review","Approved","Rejected","Archived"];

const BIZ_PREFIX = [
  "Southern Cross","Kangaroo","Coastal","Harbour","Outback","Great Barrier","Tasman","Coral","Sapphire","Ironbark"
];
const BIZ_SUFFIX = ["Consulting","Pty Ltd","Holdings","Services","Group","Solutions","Industries","Partners"];

// ---------- RNG ----------
class RNG {
  constructor(private seed = 42) {}
  next() {
    let x = (this.seed |= 0);
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x;
    return (x >>> 0) / 4294967296;
  }
  pick<T>(arr: T[]) { return arr[Math.floor(this.next() * arr.length)] }
}
const randInt = (rng: RNG, min: number, max: number) =>
  Math.floor(rng.next() * (max - min + 1)) + min;

// ---------- Generators ----------
function pad(num: number, size: number) {
  let s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

function firstName(rng: RNG) { return rng.pick(FIRST_NAMES); }
function lastName(rng: RNG)  { return rng.pick(LAST_NAMES); }
function fullName(rng: RNG)  { return `${firstName(rng)} ${lastName(rng)}`; }

function randomLandline(rng: RNG) {
  // Landline example: (02|03|07|08) xxxx xxxx
  const ac = rng.pick(["02","03","07","08"]);
  const a = String(randInt(rng, 1000, 9999));
  const b = String(randInt(rng, 1000, 9999));
  return `(${ac}) ${a} ${b}`;
}

function randomBusiness(rng: RNG) {
  return `${rng.pick(BIZ_PREFIX)} ${rng.pick(BIZ_SUFFIX)}`;
}

function randomEmail(rng: RNG) {
  const f = firstName(rng).toLowerCase();
  const l = lastName(rng).toLowerCase();
  const sep = rng.pick([".","_",""]);
  return `${f}${sep}${l}@example.com`;
}

function randomDatePast(rng: RNG) {
  const now = new Date();
  const past = new Date(now.getFullYear() - 5, 0, 1);
  const time = past.getTime() + rng.next() * (now.getTime() - past.getTime());
  const d = new Date(time);
  const day = pad(d.getDate(), 2);
  const month = pad(d.getMonth() + 1, 2);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function randomDateFuture(rng: RNG) {
  const now = new Date();
  const future = new Date(now.getFullYear() + 5, 11, 31);
  const time = now.getTime() + rng.next() * (future.getTime() - now.getTime());
  const d = new Date(time);
  const day = pad(d.getDate(), 2);
  const month = pad(d.getMonth() + 1, 2);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function randomStatus(rng: RNG) {
  return rng.pick(STATUS_VALUES);
}

// ---------- Selection helpers ----------
function selectedTextNodes(): TextNode[] {
  const out: TextNode[] = [];
  const visit = (n: SceneNode) => {
    if (n.type === "TEXT") out.push(n);
    if ("children" in n) (n.children as SceneNode[]).forEach(visit);
  };
  figma.currentPage.selection.forEach(visit);
  return out;
}

// best-effort font loader
async function loadAFontFor(node: TextNode) {
  // If node has characters, try its first range
  if (node.characters.length > 0) {
    try {
      const f0 = node.getRangeFontName(0, 1) as FontName;
      await figma.loadFontAsync(f0);
      return;
    } catch { /* fall through */ }
  }
  // Try Inter Regular
  try {
    const inter: FontName = { family: "Inter", style: "Regular" };
    await figma.loadFontAsync(inter);
    node.fontName = inter;
    return;
  } catch { /* fall through */ }
  // Fallback: any available Regular
  const fonts = await figma.listAvailableFontsAsync().catch(() => []);
  if (fonts.length) {
    const pick = fonts.find(f => f.fontName.style === "Regular") || fonts[0];
    await figma.loadFontAsync(pick.fontName);
    node.fontName = pick.fontName;
  } else {
    throw new Error("No font available");
  }
}

// ---------- Message handler ----------
type Dataset =
  | "names"
  | "landlines"
  | "emails"
  | "business"
  | "datePast"
  | "dateFuture"
  | "status";

figma.ui.onmessage = async (msg: { type: string; dataset?: Dataset; nameFormat?: "full"|"first"|"last" }) => {
  if (msg.type !== "fill") return;

  const nodes = selectedTextNodes();
  if (nodes.length === 0) {
    figma.notify("Select text layers (or a frame containing text).");
    return;
  }

  const dataset = (msg.dataset ?? "names");
  const nameFormat = (msg.nameFormat ?? "full");

  let filled = 0;

  for (const n of nodes) {
    const rng = new RNG(Math.floor(Math.random() * 1_000_000)); // new seed per node
    await loadAFontFor(n);
    try {
      let value = "";
      switch (dataset) {
        case "names":
          value = nameFormat === "first" ? firstName(rng)
               : nameFormat === "last"  ? lastName(rng)
               : fullName(rng);
          break;
        case "landlines": value = randomLandline(rng); break;
        case "emails":    value = randomEmail(rng); break;
        case "business":  value = randomBusiness(rng); break;
        case "datePast":  value = randomDatePast(rng); break;
        case "dateFuture":value = randomDateFuture(rng); break;
        case "status":    value = randomStatus(rng); break;
      }
      n.characters = value;
      filled++;
    } catch {
      // ignore write failures (locked/missing font)
    }
  }

  figma.notify(`Filled ${filled} text layer${filled === 1 ? "" : "s"}.`);
};