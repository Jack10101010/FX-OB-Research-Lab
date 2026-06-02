const { transform } = require('@babel/core');

// Extract just the addProjectFinding fn body logic by simulating its dependencies.
// We replicate the store's mechanics: state + updateResearchProject + persist.
let persisted = null;
const state = { projects: { p1: { id:'p1', name:'EURUSD M15', findings:[ {id:'old1', type:'finding', title:'Old', note:'prev', sourceRunId:'r1', createdAt:'2026-01-01'} ] } } };
function updateResearchProject(projectId, patch) {
  state.projects[projectId] = { ...state.projects[projectId], ...patch, updatedAt:'now' };
  persisted = JSON.stringify(state.projects); // mimic persistProjects()
}
function addProjectFinding(projectId, finding = {}) {
  if (!projectId || !state.projects[projectId]) return null;
  const cleanTitle = String(finding.title || "").trim();
  const cleanNote = String(finding.note || "").trim();
  if (!cleanTitle && !cleanNote) return null;
  const current = state.projects[projectId];
  const entry = {
    id: `finding_${Date.now()}`, type: finding.type || "finding",
    title: cleanTitle || "Finding", note: cleanNote,
    sourceRunId: finding.sourceRunId || finding.runId || "",
    createdAt: new Date().toISOString(),
    source: finding.source || "run_workspace",
    runId: finding.runId || finding.sourceRunId || "",
    ...(finding.tag ? { tag: finding.tag } : {}),
  };
  updateResearchProject(projectId, { findings: [entry, ...(current.findings || [])] });
  return entry;
}

// 1. empty input cannot save
console.log('empty save     ->', addProjectFinding('p1', { note:'   ' }), '(expect null)');
console.log('no project     ->', addProjectFinding('nope', { note:'x' }), '(expect null)');
// 2. valid save returns compatible entry + prepends
const e = addProjectFinding('p1', { note:'London OB weak on news', sourceRunId:'r9', runId:'r9' });
const keysOk = ['id','type','title','note','sourceRunId','createdAt'].every(k => k in e);
console.log('entry has ProjectDetail keys ->', keysOk, '| type=', e.type, '| sourceRunId=', e.sourceRunId, '| source=', e.source);
console.log('prepended (newest first) ->', state.projects.p1.findings[0].note, '| total=', state.projects.p1.findings.length, '(expect new note, 2)');
console.log('old finding still intact ->', state.projects.p1.findings[1].id, '(expect old1)');
console.log('persisted called ->', persisted ? 'yes' : 'no');
