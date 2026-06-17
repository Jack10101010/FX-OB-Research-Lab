// portfolioLibrary.validate.mjs — PORTFOLIO-SAVE-LOAD (MVP).
//
// Validates the pure portfolio-library logic + simulates the store flows
// (migration, save/load/revert, orphan reconcile) using the pure helpers — the
// same surface store.js composes. React/localStorage are NOT exercised here.
//
// Run from frontend/:  node src/data/__validation__/portfolioLibrary.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(spec); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const lib = loadCjs("src/data/portfolioLibrary.js");
const sp = loadCjs("src/data/sessionProfiles.js");
const {
    normalizeRecord, normalizeLibrary, isLibraryEmpty, listRecords,
    createRecord, duplicateRecord, renameRecord, setRecordDescription, deleteRecord,
    saveIntoRecord, mergeLibraries, isDirty, canonicalProfiles, summarizePortfolio,
    PORTFOLIO_RECORD_VERSION,
} = lib;
const { emptyProfiles, normalizeProfiles, SESSION_KEYS, CELL_KEYS, entryProfileId } = sp;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// fixtures ──────────────────────────────────────────────────────────────────────
const s0 = SESSION_KEYS[0], s1 = SESSION_KEYS[1];
const c0 = CELL_KEYS[0], c1 = CELL_KEYS[1];
const TE = entryProfileId({ model: "triggered_edge", threshold: 25, arm: "next" }); // entry_te_25_next
const withOverrides = () => normalizeProfiles({
    enabled: true,
    profiles: { entry: { [TE]: { model: "triggered_edge", threshold: 25, arm: "next" } }, be: {}, target: { target_rr_2: { type: "rr", value: 2 } } },
    cards: {
        [s0]: { enabled: true, default: {}, overrides: { [c0]: { targetRef: "target_rr_2" }, [c1]: { entryRef: TE } } },
        [s1]: { enabled: false, default: {}, overrides: {} },
    },
});

// 1. normalizeRecord ──────────────────────────────────────────────────────────────
console.log("\n[1] normalizeRecord");
{
    const r = normalizeRecord({ name: "  Mean Reversion  ", profiles: emptyProfiles() });
    ok(r && typeof r.id === "string" && r.id.length > 0, "mints an id");
    ok(r.name === "Mean Reversion", "trims name");
    ok(r.projectId === null, "reserves projectId: null");
    ok(r.version === PORTFOLIO_RECORD_VERSION, "stamps version");
    ok(r.createdAt && r.updatedAt, "stamps timestamps");
    ok(r.profiles && typeof r.profiles === "object", "normalizes profiles");
    ok(normalizeRecord(null) === null && normalizeRecord(42) === null, "junk → null");
    ok(normalizeRecord({}).name === "Untitled", "missing name → Untitled");
}

// 2. normalizeLibrary (id-keyed) ──────────────────────────────────────────────────
console.log("\n[2] normalizeLibrary");
{
    const lb = normalizeLibrary({ a: { id: "a", name: "A", profiles: emptyProfiles() }, junk: 5, b: { name: "B", profiles: emptyProfiles() } });
    ok(Object.keys(lb).every((k) => lb[k].id === k), "key === record.id");
    ok(lb.a && lb.a.name === "A", "keeps valid record");
    ok(!("junk" in lb), "drops junk");
    ok(isLibraryEmpty(normalizeLibrary(null)) && isLibraryEmpty({}), "isLibraryEmpty");
}

// 3. CRUD immutability + behavior ─────────────────────────────────────────────────
console.log("\n[3] CRUD");
{
    let L = {};
    const c = createRecord(L, { name: "P1", profiles: emptyProfiles() });
    ok(Object.keys(L).length === 0, "createRecord does not mutate input (immutable)");
    ok(Object.keys(c.library).length === 1 && c.library[c.id], "createRecord adds one");
    L = c.library;
    // unique name de-collision
    const c2 = createRecord(L, { name: "P1", profiles: emptyProfiles() });
    ok(c2.library[c2.id].name === "P1 (2)", "createRecord de-collides name");
    L = c2.library;
    // duplicate
    const d = duplicateRecord(L, c.id);
    ok(d.id && d.id !== c.id, "duplicate new id");
    ok(d.library[d.id].name === "P1 (copy)", "duplicate (copy) name");
    ok(canonicalProfiles(d.library[d.id].profiles) === canonicalProfiles(L[c.id].profiles), "duplicate copies profiles");
    L = d.library;
    // rename
    L = renameRecord(L, c.id, "Renamed");
    ok(L[c.id].name === "Renamed", "rename");
    ok(renameRecord(L, c.id, "  ") === L, "empty rename is a no-op");
    // description
    L = setRecordDescription(L, c.id, "hello");
    ok(L[c.id].description === "hello", "setRecordDescription");
    // delete
    const before = Object.keys(L).length;
    L = deleteRecord(L, c.id);
    ok(Object.keys(L).length === before - 1 && !L[c.id], "delete removes");
    ok(deleteRecord(L, "nope") === L, "delete missing is a no-op");
}

// 4. saveIntoRecord ───────────────────────────────────────────────────────────────
console.log("\n[4] saveIntoRecord");
{
    const c = createRecord({}, { name: "S", profiles: emptyProfiles() });
    const id = c.id;
    const prevUpdated = c.library[id].updatedAt;
    const L2 = saveIntoRecord(c.library, id, withOverrides());
    ok(canonicalProfiles(L2[id].profiles) === canonicalProfiles(withOverrides()), "save overwrites profiles snapshot");
    ok(L2[id].id === id && L2[id].createdAt === c.library[id].createdAt, "save preserves id + createdAt");
    ok(typeof L2[id].updatedAt === "string", "save stamps updatedAt");
    ok(saveIntoRecord(c.library, "missing", emptyProfiles()) === c.library, "save into missing is a no-op");
    void prevUpdated;
}

// 5. dirty detection (enabled excluded, order-independent, version-stable) ─────────
console.log("\n[5] dirty detection");
{
    const rec = createRecord({}, { name: "D", profiles: withOverrides() });
    const record = rec.library[rec.id];
    ok(isDirty(withOverrides(), record) === false, "identical working ⇒ not dirty");
    // enabled-only difference must NOT be dirty
    const flipped = normalizeProfiles({ ...withOverrides(), enabled: false });
    ok(isDirty(flipped, record) === false, "enabled-only change ⇒ NOT dirty");
    // insertion-order difference must NOT be dirty
    const reordered = normalizeProfiles({
        enabled: true,
        profiles: { target: { target_rr_2: { type: "rr", value: 2 } }, be: {}, entry: { [TE]: { model: "triggered_edge", threshold: 25, arm: "next" } } },
        cards: { [s1]: { enabled: false, default: {}, overrides: {} }, [s0]: { enabled: true, default: {}, overrides: { [c1]: { entryRef: TE }, [c0]: { targetRef: "target_rr_2" } } } },
    });
    ok(isDirty(reordered, record) === false, "key/insertion order ⇒ NOT dirty (canonical)");
    // a real change IS dirty
    const changed = normalizeProfiles({ ...withOverrides(), cards: { ...withOverrides().cards, [s0]: { enabled: true, default: {}, overrides: {} } } });
    ok(isDirty(changed, record) === true, "removing an override ⇒ dirty");
    // no record: empty working ⇒ not dirty; non-empty ⇒ dirty
    ok(isDirty(emptyProfiles(), null) === false, "no record + empty working ⇒ not dirty");
    ok(isDirty(withOverrides(), null) === true, "no record + non-empty working ⇒ dirty");
}

// 6. summarizePortfolio (derived counts) ──────────────────────────────────────────
console.log("\n[6] summarizePortfolio");
{
    const s = summarizePortfolio(withOverrides());
    ok(s.customStrategies === 2, `customStrategies = 2 (got ${s.customStrategies})`);
    ok(s.targetOverrides === 1, `targetOverrides = 1 (got ${s.targetOverrides})`);
    ok(s.disabledCohorts === CELL_KEYS.length, `disabledCohorts = ${CELL_KEYS.length} (whole-session disable; got ${s.disabledCohorts})`);
    const empty = summarizePortfolio(emptyProfiles());
    ok(empty.customStrategies === 0 && empty.disabledCohorts === 0 && empty.targetOverrides === 0, "empty portfolio ⇒ all zero");
}

// 7. mergeLibraries (backend sync) ────────────────────────────────────────────────
console.log("\n[7] mergeLibraries");
{
    const local = { x: normalizeRecord({ id: "x", name: "Lx", updatedAt: "2024-01-01T00:00:00Z", profiles: emptyProfiles() }) };
    const remote = {
        x: normalizeRecord({ id: "x", name: "Rx", updatedAt: "2025-01-01T00:00:00Z", profiles: emptyProfiles() }),
        y: normalizeRecord({ id: "y", name: "Ry", updatedAt: "2025-01-01T00:00:00Z", profiles: emptyProfiles() }),
    };
    const m = mergeLibraries(local, remote);
    ok(m.x.name === "Rx", "newer updatedAt wins on id conflict");
    ok(m.y && m.y.name === "Ry", "union brings in remote-only records");
    ok(mergeLibraries({}, remote).x.name === "Rx", "empty local ⇒ remote");
}

// 8. store-flow simulations: migration / load / revert / orphan ───────────────────
console.log("\n[8] store-flow simulations");
{
    // migration: empty library + a working copy → My Portfolio
    const working = withOverrides();
    let L = {};
    let loadedId = null;
    if (isLibraryEmpty(L)) { const r = createRecord(L, { name: "My Portfolio", profiles: working }); L = r.library; loadedId = r.id; }
    ok(L[loadedId] && L[loadedId].name === "My Portfolio", "migration creates My Portfolio");
    ok(canonicalProfiles(L[loadedId].profiles) === canonicalProfiles(working), "migration snapshots working copy");

    // load (preserve enabled): working := record.profiles with current enabled
    const rec2 = createRecord(L, { name: "Other", profiles: emptyProfiles() });
    L = rec2.library;
    const curEnabled = false;
    let workingNow = normalizeProfiles({ ...normalizeProfiles(L[rec2.id].profiles), enabled: curEnabled });
    loadedId = rec2.id;
    ok(isDirty(workingNow, L[loadedId]) === false, "after load ⇒ not dirty");
    ok(workingNow.enabled === curEnabled, "load preserves working enabled");

    // edit → dirty → save → clean
    workingNow = withOverrides();
    ok(isDirty(workingNow, L[loadedId]) === true, "after edit ⇒ dirty");
    L = saveIntoRecord(L, loadedId, workingNow);
    ok(isDirty(workingNow, L[loadedId]) === false, "after save ⇒ clean");

    // revert: working := record snapshot
    workingNow = withOverrides(); workingNow = normalizeProfiles({ ...workingNow, cards: {} }); // diverge
    ok(isDirty(workingNow, L[loadedId]) === true, "diverged ⇒ dirty before revert");
    workingNow = normalizeProfiles(L[loadedId].profiles);
    ok(isDirty(workingNow, L[loadedId]) === false, "after revert ⇒ clean");

    // orphan reconcile: loadedId removed from library → pointer must clear
    L = deleteRecord(L, loadedId);
    const reconciled = L[loadedId] ? loadedId : null;
    ok(reconciled === null, "orphaned loadedPortfolioId reconciles to null");
}

// 9. persistence round-trip (normalize idempotence) ───────────────────────────────
console.log("\n[9] persistence round-trip");
{
    const r = createRecord({}, { name: "RT", profiles: withOverrides() });
    const json = JSON.stringify(r.library);
    const back = normalizeLibrary(JSON.parse(json));
    ok(canonicalProfiles(back[r.id].profiles) === canonicalProfiles(r.library[r.id].profiles), "JSON round-trip stable");
    ok(JSON.stringify(normalizeLibrary(JSON.parse(JSON.stringify(back)))) === JSON.stringify(back), "normalize is idempotent");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
