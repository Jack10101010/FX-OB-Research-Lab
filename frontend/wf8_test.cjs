// Mirror the FindingItem field-resolution logic to verify all finding variants.
function resolve(finding, runsById={}) {
  const isTableCompare = finding.source === "table_compare";
  const meta = finding.meta && typeof finding.meta === "object" ? finding.meta : {};
  const tableName = finding.table || meta.table || "";
  const bucketName = finding.bucket || meta.bucket || "";
  const comparedRunId = finding.comparedRunId || meta.comparedRunId || "";
  const comparedLabel = runsById[comparedRunId] || comparedRunId || "";
  return { isTableCompare, tableName, bucketName, comparedRunId, comparedLabel, showsContext: isTableCompare && (tableName||bucketName||comparedLabel) };
}
const runs = { rB: "EURUSD M15 RR3" };
console.log('legacy manual ->', JSON.stringify(resolve({type:'finding',title:'x',note:'n'})));
console.log('run_workspace ->', JSON.stringify(resolve({type:'finding',note:'n',source:'run_workspace',runId:'rA'})));
console.log('table top-level ->', JSON.stringify(resolve({source:'table_compare',table:'Structure Quality',bucket:'Strong',comparedRunId:'rB'},runs)));
console.log('table meta-only ->', JSON.stringify(resolve({source:'table_compare',meta:{table:'OB Age',bucket:'Old',comparedRunId:'rB'}},runs)));
console.log('table missing comparedRun ->', JSON.stringify(resolve({source:'table_compare',table:'T',bucket:'B'})));
console.log('table unresolved run id ->', JSON.stringify(resolve({source:'table_compare',comparedRunId:'rZ'})));
