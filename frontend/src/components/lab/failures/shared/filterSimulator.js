// ── filterSimulator.js ───────────────────────────────────────────────────────
// BACK-COMPAT SHIM (Research Lab Phase 0). The filter-discovery / cohort-removal
// truth layer moved to the neutral data layer at data/cohortFilterSimulator.js so
// non-Failures consumers can share one engine. This module re-exports it unchanged
// — every existing Failures Lab import (metricsOf, simulateRemoval, cohortMatcher,
// cohortLabel, recommendFilter, buildFilterDiscovery, bestFiltersByDimension,
// DISCOVERY_PAIRS, REC_* thresholds) keeps working with identical behavior.

export * from "@/data/cohortFilterSimulator";
