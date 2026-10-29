#!/usr/bin/env node
// Imports CTF writeups from ../Projects/ctf into content/writeups as markdown
// files with a small YAML-ish front matter block. Run: node scripts/import.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CTF = path.resolve(ROOT, "..", "Projects", "ctf");
const OUT = path.join(ROOT, "content", "writeups");

// Existing source IDs are stable; reimports never overwrite edited articles.
const existingSources = new Set();
for (const dir of fs.existsSync(OUT) ? fs.readdirSync(OUT, {withFileTypes:true}) : []) {
  if (!dir.isDirectory()) continue;
  for (const name of fs.readdirSync(path.join(OUT, dir.name))) {
    if (!name.endsWith('.md')) continue;
    const text = fs.readFileSync(path.join(OUT, dir.name, name), 'utf8');
    const source = text.match(/^source:\s*"(.+)"$/m)?.[1];
    if (source) existingSources.add(source);
  }
}
const events = {
  isfcr: { name: "ISFCR CTF 2026", short: "ISFCR" },
  h7ctf: { name: "H7CTF 2026", short: "H7CTF" },
  xploit: { name: "XploitX CTF 2026", short: "XploitX" },
  gencysctf: { name: "GenCyS CTF 2026", short: "GenCyS" },
  nns: { name: "NNS CTF 2026", short: "NNS" },
  noct: { name: "NOCT CTF 2026", short: "NOCT" },
  sec: { name: "SEC CTF 2026", short: "SEC" },
  sun: { name: "SunshineCTF 2026", short: "Sunshine" },
  tctf: { name: "TCTF 2026", short: "TCTF" },
  k17: { name: "K17 CTF 2026", short: "K17" },
  lunar: { name: "Lunar CTF 2026", short: "Lunar" },
  luna1: { name: "Luna CTF 2026", short: "Luna" },
  cryovault: { name: "ISFCR CryoVault Finals 2026", short: "CryoVault" },
};

const CATEGORIES = new Set([
  "web", "crypto", "pwn", "rev", "forensics", "mobile", "iot",
  "ml", "osint", "misc", "cloud", "boot2root", "networking", "steg",
  "hardware", "devsec", "ai",
]);

// ---------------------------------------------------------------- ISFCR
const isfcrMap = {
  "mirage": "pwn",
  "mono": "crypto",
  "neve": "crypto",
  "zygote-conspiracy": "mobile",
  "ghost-13": "iot",
  "end-mark": "forensics",
  "the-ledger": "rev",
  "parallax": "crypto",
  "turning-chart": "rev",
  "fluxgate-g3": "iot",
  "draftpad": "web",
  "keystone-user-and-root": "boot2root",
  "faraday-cage": "mobile",
  "toxic-waste": "crypto",
  "flaguard": "mobile",
  "mirror-garden": "mobile",
  "half-truths": "crypto",
  "last-packet": "forensics",
  "ouroboros": "rev",
  "echo-9": "iot",
  "lossless-not-harmless": "forensics",
  "the-alphabet-that-wasnt-there": "forensics",
  "the-third-key-phase": "forensics",
  "insanity-check-3": "misc",
  "ghosts-in-the-bulb": "forensics",
  "one-more": "crypto",
  "sparse-change": "crypto",
  "the-api-that-knows-too-much": "web",
  "the-hidden-test-case": "web",
  "phantom-mesh": "forensics",
  "the-last-committed-message": "forensics",
  "echochamber-user-and-root": "boot2root",
  "the-shape-of-silence": "ml",
  "phantom-15": "iot",
  "ghost-in-the-spooler": "forensics",
  "the-image-that-forgot": "forensics",
  "signed-but-which-original": "forensics",
  "frost-ledger": "forensics",
  "one-pound-fish": "osint",
  "ghosts-in-the-bulb-local": "forensics",
  "aggregate_remembers_writeup": "ml",
  "attestation": "web",
  "canonical-sin": "web",
  "cassandra": "web",
  "field-console": "mobile",
  "free-lunch": "crypto",
  "hidden-weights-writeup": "ml",
  "implicit_twins_writeup": "crypto",
  "journal-necromancy-writeup": "forensics",
  "leaky-eval-writeup": "crypto",
  "loom": "rev",
  "meridian": "web",
  "oatmeal": "mobile",
  "palimpsest": "rev",
  "prismwake_writeup": "crypto",
  "recurrence": "rev",
  "rimefold": "pwn",
  "slab": "pwn",
  "the-press-writeup": "rev",
  "the_deletion_echo_writeup": "ml",
  "turning-chart-teammate": "rev",
  "write-hole-writeup": "forensics",
  "zygote-conspiracy-teammate": "mobile",
};

const TEAMMATE = new Set([
  "aggregate_remembers_writeup", "attestation", "canonical-sin", "cassandra",
  "field-console", "free-lunch", "hidden-weights-writeup", "implicit_twins_writeup",
  "journal-necromancy-writeup", "leaky-eval-writeup", "loom", "meridian",
  "oatmeal", "palimpsest", "prismwake_writeup", "recurrence", "rimefold", "slab",
  "the-press-writeup", "the_deletion_echo_writeup", "turning-chart-teammate",
  "write-hole-writeup", "zygote-conspiracy-teammate",
]);

// ---------------------------------------------------------------- other events
// [event, file, category]
const extras = [
  ["gencysctf", "gencysctf/ai/1/writeup.md", "ai"],
  ["gencysctf", "gencysctf/mobile/1/writeup.md", "mobile"],
  ["gencysctf", "gencysctf/un/unkown/writeup.md", "cloud"],

  ["h7ctf", "H7CTF/cloud/1/writeup.md", "cloud"],
  ["h7ctf", "H7CTF/crypto/MURMUR-1.2.md", "crypto"],
  ["h7ctf", "H7CTF/forensic/1/writeup.md", "forensics"],
  ["h7ctf", "H7CTF/forensic/3/writeup.md", "forensics"],
  ["h7ctf", "H7CTF/forensic/4/writeup.md", "forensics"],
  ["h7ctf", "H7CTF/misc/1/sparrow-freight-api/writeup.md", "web"],
  ["h7ctf", "H7CTF/mobile/3/writeup.md", "mobile"],
  ["h7ctf", "H7CTF/pwn/3/writeup.md", "pwn"],
  ["h7ctf", "H7CTF/rev/insane/writeup.md", "rev"],

  ["k17", "K17/beginner/roulette/writeup.md", "web"],
  ["luna1", "luna1/forensic/challenge/README.md", "forensics"],
  ["lunar", "lunar/forensic/4/writeup.md", "forensics"],

  ["nns", "NNS/devsec/1/writeup.md", "devsec"],
  ["nns", "NNS/web/web-hacker-2/writeup.md", "web"],

  ["noct", "NOCT/web/2/writeup.md", "web"],
  ["noct", "NOCT/web/4/writeup.md", "web"],

  ["sec", "sec/crypto/et/writeup.md", "crypto"],
  ["sec", "sec/web/hard/blackout-gateway/writeup.md", "web"],

  ["sun", "sun/forensic/welcome/writeup.md", "forensics"],
  ["sun", "sun/web/reader/MANUAL_SOLVE.md", "web"],
  ["sun", "sun/web/tommarow/writeup.md", "web"],

  ["tctf", "tctf/misc/vvdrug-cartel-web/README.md", "web"],

  ["xploit", "xploit/xploit-2/crypto/biased-nonce/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-2/networking/port-oxbeef/writeup.md", "networking"],
  ["xploit", "xploit/xploit-2/steg/double-exposure/.read.md", "steg"],
  ["xploit", "xploit/xploit-2/steg/nested-steam-package/.read.md", "steg"],
  ["xploit", "xploit/xploit-2/steg/two-faces/.read.md", "steg"],
  ["xploit", "xploit/xploit-3/pwn/orisond/writeup.md", "pwn"],
  ["xploit", "xploit/xploit-5/steg/logs/.read.md", "steg"],
  ["xploit", "xploit/xploit-5/steg/redacted/.read.md", "steg"],
  ["xploit", "xploit/xploit/steg/neon-relic/hi/writeup.md", "steg"],

  // ---- backfilled writeups (challenges that only had solve scripts) ----
  ["h7ctf", "H7CTF/ai/writeup.md", "ai"],
  ["h7ctf", "H7CTF/crypto/1/writeup.md", "crypto"],
  ["h7ctf", "H7CTF/crypto/3/writeup.md", "crypto"],
  ["h7ctf", "H7CTF/hardwate/hardd/1/writeup.md", "hardware"],
  ["h7ctf", "H7CTF/misc/2/writeup.md", "misc"],
  ["h7ctf", "H7CTF/pwn/1/writeup.md", "pwn"],
  ["h7ctf", "H7CTF/pwn1/writeup-pwn1.md", "pwn"],
  ["h7ctf", "H7CTF/pwn/4/writeup.md", "pwn"],
  ["h7ctf", "H7CTF/rev/hard/writeup.md", "rev"],
  ["h7ctf", "H7CTF/test/writeup-passport.md", "web"],
  ["h7ctf", "H7CTF/test4/solve/writeup.md", "pwn"],
  ["h7ctf", "H7CTF/test6/writeup.md", "pwn"],

  ["luna1", "luna1/crypto/writeup.md", "crypto"],
  ["luna1", "luna1/web/1/writeup.md", "web"],
  ["luna1", "luna1/hardware/moonchace/writeup.md", "hardware"],

  ["lunar", "lunar/crypto/writeup-ecdsa-hnp.md", "crypto"],
  ["lunar", "lunar/forensic/6/writeup.md", "forensics"],
  ["lunar", "lunar/pwn/1/writeup.md", "pwn"],

  ["nns", "NNS/crypto/nostalgia/writeup.md", "crypto"],
  ["nns", "NNS/forensic/forensics_min-beste-venn/writeup.md", "forensics"],
  ["nns", "NNS/pwn/BYOC/pwn_byoc/writeup.md", "pwn"],
  ["nns", "NNS/pwn/pset1/pwn_pset1/writeup.md", "pwn"],

  ["sun", "sun/pwn/total-recall/writeup.md", "pwn"],
  ["sun", "sun/forensic/cut-me/writeup.md", "forensics"],
  ["sun", "sun/web/ground/writeup.md", "web"],

  ["tctf", "tctf/crypto/writeup.md", "crypto"],
  ["tctf", "tctf/test/writeup.md", "misc"],

  ["gencysctf", "gencysctf/test/writeup.md", "misc"],

  ["xploit", "xploit/xploit-2/crypto/bit-flip-2/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-2/crypto/cuspidal-drift/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-2/networking/tcp-scrodinger/writeup.md", "networking"],
  ["xploit", "xploit/xploit-2/steg/slow-motion/writeup.md", "steg"],
  ["xploit", "xploit/xploit-3/crypto/broadcast-linuer/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-3/crypto/weight/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-4/crypto/linear/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-5/crypto/common-modulus/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-5/crypto/smooth-dh/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-5/steg/paleter/writeup.md", "steg"],
  ["xploit", "xploit/xploit-5/steg/writeup.md", "steg"],
  ["xploit", "xploit/xploit/networking/BGP/writeup.md", "networking"],
  ["xploit", "xploit/xploit/networking/Ghost-in-the-wire/writeup.md", "networking"],
  ["xploit", "xploit/xploit/networking/Route666/writeup.md", "networking"],
  ["xploit", "xploit/xploit/crypto/related/writeup.md", "crypto"],
  ["xploit", "xploit/xploit/crypto/small-private/writeup.md", "crypto"],
  ["xploit", "xploit/xploit/crypto/truncated-oracle/writeup.md", "crypto"],
  ["xploit", "xploit/xploit/crypto/matrix-over-mind/writeup.md", "crypto"],
  ["xploit", "xploit/xploit/crypto/Boneh/writeup.md", "crypto"],
  ["xploit", "xploit/xploit/crypto/Partial-exposure/writeup.md", "crypto"],
  ["xploit", "xploit/xploit-4/pwn/writeup.md", "pwn"],

  // ---- ISFCR CryoVault Finals ----
  ["cryovault", "cryovault/crypto/1/writeup.md", "crypto"],
  ["cryovault", "cryovault/crypto/9/writeup.md", "crypto"],
  ["cryovault", "cryovault/forensic/10/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/11/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/2/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/3/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/5/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/7/writeup.md", "forensics"],
  ["cryovault", "cryovault/forensic/9/writeup.md", "forensics"],
  ["cryovault", "cryovault/iot/2/writeup.md", "iot"],
  ["cryovault", "cryovault/iot/3/writeup.md", "iot"],
  ["cryovault", "cryovault/iot/4/writeup.md", "iot"],
  ["cryovault", "cryovault/iot/dead/writeup.md", "iot"],
  ["cryovault", "cryovault/misc/1/writeup.md", "misc"],
  ["cryovault", "cryovault/misc/2/writeup.md", "misc"],
  ["cryovault", "cryovault/misc/frost/writeup.md", "misc"],
  ["cryovault", "cryovault/misc/redslayer/writeup.md", "misc"],
  ["cryovault", "cryovault/pwn/1/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/3/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/blizzard/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/drif/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/floe/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/rime/writeup.md", "pwn"],
  ["cryovault", "cryovault/pwn/thaw/writeup.md", "pwn"],
  ["cryovault", "cryovault/rev/1/writeup.md", "rev"],
  ["cryovault", "cryovault/rev/4/writeup.md", "rev"],
  ["cryovault", "cryovault/web/1/writeup.md", "web"],
  ["cryovault", "cryovault/web/2/writeup.md", "web"],
  ["cryovault", "cryovault/web/5/writeup.md", "web"],
  ["cryovault", "cryovault/web/6/writeup.md", "web"],
  ["cryovault", "cryovault/web/7/writeup.md", "web"],
];

// ---------------------------------------------------------------- helpers
const stripMd = (s) =>
  s.replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*\-+|]+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// A few sources have no H1 or have generic ones.
const TITLE_OVERRIDES = {
  "cryovault/crypto/1/writeup.md": "Algebraic Mirage",
  "cryovault/crypto/9/writeup.md": "CryoVault Thaw Interlock (Firmware 4.3)",
  "cryovault/forensic/10/writeup.md": "Borrowed Address — Recovering the Closing Batch",
  "cryovault/forensic/11/writeup.md": "The Export That Never Existed",
  "cryovault/forensic/2/writeup.md": "Missing Receipt",
  "cryovault/forensic/3/writeup.md": "Recovering the Sealed Manifest",
  "cryovault/forensic/5/writeup.md": "Chronoglyph",
  "cryovault/forensic/7/writeup.md": "Cold Registry — frost-n04 Vault Release Code",
  "cryovault/forensic/9/writeup.md": "CryoVault Dial Verification",
  "cryovault/iot/2/writeup.md": "SILT Field Rack / Revision D",
  "cryovault/iot/3/writeup.md": "Vesper — Missed-Handover Recovery",
  "cryovault/iot/4/writeup.md": "Poisoned Update",
  "cryovault/iot/dead/writeup.md": "Deadbit Thermostat",
  "cryovault/misc/1/writeup.md": "Frostline Hall C — Thermal Camera Patrol",
  "cryovault/misc/2/writeup.md": "Ligatures & Liabilities",
  "cryovault/misc/frost/writeup.md": "Frost Paw",
  "cryovault/misc/redslayer/writeup.md": "CryoVault 2.0",
  "cryovault/pwn/1/writeup.md": "Glacier",
  "cryovault/pwn/3/writeup.md": "Neve",
  "cryovault/pwn/blizzard/writeup.md": "Blizzard",
  "cryovault/pwn/drif/writeup.md": "Drif",
  "cryovault/pwn/floe/writeup.md": "Floe",
  "cryovault/pwn/rime/writeup.md": "Rime",
  "cryovault/pwn/thaw/writeup.md": "Thaw Ladder",
  "cryovault/rev/1/writeup.md": "Embedded Bytecode VM",
  "cryovault/rev/4/writeup.md": "Q.E.D. — Prove the Impossible",
  "cryovault/web/1/writeup.md": "The Ledger Access Gate",
  "cryovault/web/2/writeup.md": "Conduit Preview — SSTI Filter Bypass",
  "cryovault/web/5/writeup.md": "Cold Dock",
  "cryovault/web/6/writeup.md": "Drumlin — Frostline Cold Archive (Build 2.4)",
  "cryovault/web/7/writeup.md": "Halo Telemetry Align",
  "tctf/misc/vvdrug-cartel-web/README.md": "VVDrug Cartel — Web",
  "sec/crypto/et/writeup.md": "ET — Tu Brute",
  "sun/forensic/welcome/writeup.md": "Welcome",
  "xploit/xploit-5/steg/redacted/.read.md": "Redacted Minutes",
  "gencysctf/ai/1/writeup.md": "The Secure Trust Bank — RAG Data Leakage",
  "gencysctf/mobile/1/writeup.md": "SecureTrust Mobile — Forgotten",
  "H7CTF/forensic/4/writeup.md": "St. Cascade General — Mid-Run Ransomware",
  "H7CTF/forensic/1/writeup.md": "Deleting a Thing",
  "H7CTF/pwn/3/writeup.md": "hothouse",
  "NNS/devsec/1/writeup.md": "Hiding in Your Wi-Fi",
  "NNS/web/web-hacker-2/writeup.md": "Web Hacker 2",
  "isfcr/writeups/ghosts-in-the-bulb-local.md": "Ghosts in the Bulb — Local Version",
};

function cleanTitle(raw, fallback) {
  let t = raw
    .replace(/^#\s*/, "")
    .replace(/^write-?up\s*[—–:-]\s*/i, "")
    .replace(/\s*[—–-]\s*cryovault\s*(2026\s*)?finals\s*$/i, "")
    .replace(/\s*[—–-]\s*(forensic\s+|ctf\s+)?write-?up\s*$/i, "")
    .replace(/\s*[—–-]\s*(CTF\s+)?write-?up\s*$/i, "")
    .replace(/\s*\((?:CTF\s+)?write-?up\)\s*$/i, "")
    .replace(/\s+(?:CTF\s+)?write-?up\s*$/i, "")
    .replace(/^(?:Challenge\s+)?Write-?up:\s*/i, "")
    .replace(/^H7CTF\s+Forensic\s+\d+\s*[—–-]\s*/i, "")
    .replace(/^H7CTF\s*[—–-]\s*/i, "")
    .replace(/^ISFCR\s+rev\s*[—–-]\s*/i, "")
    .replace(/\s*[—–-]\s*$/,"")
    .replace(/[`:]+$/,"")
    .replace(/`/g, "")
    .replace(/\s*---+\s*/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/^`+|`+$/g, "");
  /* lone lowercase challenge names → capitalise (e.g. "floe" → "Floe") */
  if (/^[a-z][a-z0-9_-]*$/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!t || t.length > 90) t = fallback;
  return t;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[`'"’]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function summaryOf(body, title) {
  const withoutTitle = body.replace(/^#\s+.*$/m, "");
  const blocks = withoutTitle.split(/\n\s*\n/);
  const candidates = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || /^```/.test(trimmed) || /^[|>]/.test(trimmed)) continue;
    const text = stripMd(trimmed);
    if (text.length < 45) continue;
    if (/^[A-Za-z][A-Za-z0-9_]{1,24}\{[^\n{}]{2,120}\}/.test(text)) continue;
    if (/\b(?:isfcr|H7CTF|XploitX|Lun4R|NNS|NOCT|flag)\{[^}]{2,120}\}/.test(text)) continue;
    if (/^(challenge|category|points|difficulty|target|file|binary|author|flag|date|event|status|objective|format)\b\s*[:—-]/i.test(text)) continue;
    if (/^(challenge overview|challenge description|challenge summary)\b/i.test(text) && text.length < 240) continue;
    candidates.push(text);
  }
  let text = candidates[0] || `${title} — a CTF challenge writeup.`;
  if (text.length > 190) text = text.slice(0, 187).replace(/\s+\S*$/, "") + "…";
  return text;
}

function yamlValue(v) {
  return JSON.stringify(v);
}

const EVENTS_SHORT = {
  isfcr: "ISFCR CTF 2026",
  h7ctf: "H7CTF 2026",
  xploit: "XploitX 2026",
  gencysctf: "GenCyS CTF 2026",
  nns: "NNS CTF 2026",
  noct: "NOCT CTF 2026",
  sec: "SEC CTF 2026",
  sun: "SunshineCTF 2026",
  tctf: "TCTF 2026",
  k17: "K17 CTF 2026",
  lunar: "Lunar CTF 2026",
  luna1: "Luna CTF 2026",
  cryovault: "ISFCR CryoVault Finals 2026",
};

// tiny YAML-ish helpers (values are JSON, which is valid YAML)
const YAML = { flow: (arr) => JSON.stringify(arr).replace(/"/g, "\u0022") };

const CATEGORY_LABELS = {
  web: "Web", crypto: "Crypto", pwn: "Pwn", rev: "Reverse",
  forensics: "Forensics", mobile: "Mobile", iot: "IoT", ml: "ML",
  ai: "AI", osint: "OSINT", misc: "Misc", cloud: "Cloud",
  boot2root: "Boot2Root", networking: "Networking", steg: "Stego",
  devsec: "DevSec", hardware: "Hardware",
};

function writeEntry({ event, file, category, title, date, teammate = false }) {
  if (existingSources.has(file)) return;
  const src = path.join(CTF, file);
  if (!fs.existsSync(src)) {
    console.warn("missing:", file);
    return;
  }
  const raw = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");
  const h1 = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fallback = path.basename(file).replace(/\.(md|txt)$/i, "").replace(/[_-]+/g, " ");
  const finalTitle = cleanTitle(TITLE_OVERRIDES[file] || title || h1 || fallback, fallback);
  const base = path.basename(file).replace(/\.(md|txt)$/i, "").replace(/^\./, "");
  const generic = /^(writeup|readme|read|readme \(2\)|manual.solve|challenge.*)$/i.test(base);
  let slug = slugify(generic ? finalTitle : base);
  if (!slug) slug = slugify(finalTitle);
  // guarantee a unique filename inside the event directory
  let n = 2;
  while (fs.existsSync(path.join(OUT, event, `${slug}.md`))) slug = `${slugify(generic ? finalTitle : base)}-${n++}`;

  // strip an existing leading H1 (the template renders the title)
  const body = raw.replace(/^#\s+.*\n+/, "").trim();
  const eventDir = path.join(OUT, event);
  fs.mkdirSync(eventDir, { recursive: true });

  const front = {
    title: finalTitle,
    description: summaryOf(raw, finalTitle),
    event,
    category,
    categoryLabel: CATEGORY_LABELS[category] || category,
    tags: [EVENTS_SHORT[event] || event, category],
    date,
    teammate,
    source: file,
  };
  const fm = Object.entries(front)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? YAML.flow(v) : yamlValue(v)}`)
    .join("\n");
  fs.writeFileSync(path.join(eventDir, `${slug}.md`), `---\n${fm}\n---\n\n${body}\n`);
  existingSources.add(file);
  return slug;
}

// ---------------------------------------------------------------- run
// Additive import: existing source mappings, Markdown and URLs are preserved.
fs.mkdirSync(OUT, { recursive: true });

// section pages (titles/blurbs/weights) — regenerated on import
const EVENT_PAGES = [
  ["isfcr", "ISFCR CTF 2026", "The home-team event: a full slate of pwn, crypto, web, forensics, IoT and mobile challenges."],
  ["h7ctf", "H7CTF 2026", "Cloud, forensics, mobile, pwn and reverse engineering."],
  ["xploit", "XploitX CTF 2026", "Crypto, pwn, steganography and network challenges."],
  ["gencysctf", "GenCyS CTF 2026", "AI, cloud and Android security challenges."],
  ["nns", "NNS CTF 2026", "DevSecOps and web security."],
  ["noct", "NOCT CTF 2026", "Web exploitation challenges."],
  ["sec", "SEC CTF 2026", "Crypto and web challenges."],
  ["sun", "SunshineCTF 2026", "Forensics and web."],
  ["tctf", "TCTF 2026", "Web and miscellaneous challenges."],
  ["k17", "K17 CTF 2026", "Beginner-friendly web challenges."],
  ["lunar", "Lunar CTF 2026", "Digital forensics."],
  ["luna1", "Luna CTF 2026", "Enterprise DFIR."],
  ["cryovault", "ISFCR CryoVault Finals 2026", "The ISFCR finals set: braid-matrix crypto, DFIR, IoT firmware, pwn, rev and web."],
];
// event weights are recomputed from the newest writeup in each folder at the end
const latest = {};
for (const [event, title, blurb] of EVENT_PAGES) {
  const dir = path.join(OUT, event);
  fs.mkdirSync(dir, { recursive: true });
  latest[event] = "";
  if (!fs.existsSync(path.join(dir, "_index.md"))) fs.writeFileSync(path.join(dir, "_index.md"), `+++\ntitle = '${title.replace(/'/g, "’")}'\ndescription = "${blurb.replace(/"/g, "’")}"\n+++`);
}
if (!fs.existsSync(path.join(OUT, "_index.md"))) fs.writeFileSync(path.join(OUT, "_index.md"), `+++\ntitle = 'The writeup archive'\ndescription = "94 writeups across 12 CTF events — pwn, crypto, web, forensics, mobile, IoT and more."\n+++`);

let count = 0;
const dateOf = (f) => new Date(fs.statSync(path.join(CTF, f)).mtime).toISOString().slice(0, 10);

// ISFCR consolidated collection
const isfcrDir = path.join(CTF, "isfcr", "writeups");
for (const name of fs.readdirSync(isfcrDir).sort()) {
  if (!name.endsWith(".md") || name === "README.md") continue;
  const base = name.replace(/\.md$/, "");
  const category = isfcrMap[base] || "misc";
  if (!CATEGORIES.has(category)) throw new Error(`bad category ${category} for ${name}`);
  const slug = writeEntry({
    event: "isfcr",
    file: `isfcr/writeups/${name}`,
    category,
    date: dateOf(`isfcr/writeups/${name}`),
    teammate: TEAMMATE.has(base),
  });
  if (slug) count++;
}

for (const [event, file, category] of extras) {
  if (!CATEGORIES.has(category)) throw new Error(`bad category ${category} for ${file}`);
  const slug = writeEntry({ event, file, category, date: dateOf(file) });
  if (slug) count++;
}

console.log(`imported ${count} writeups into ${path.relative(ROOT, OUT)}`);

// Existing section titles, metadata and ordering are intentionally preserved.

function maxDate(dir) {
  let m = 0;
  for (const name of fs.readdirSync(dir)) {
    if (name === "_index.md" || !name.endsWith(".md")) continue;
    const fm = fs.readFileSync(path.join(dir, name), "utf8");
    const hit = fm.match(/^date:\s*["']?(\S+)/m);
    const t = hit ? Date.parse(hit[1]) : 0;
    m = Math.max(m, Number.isNaN(t) ? 0 : t);
  }
  return m;
}
