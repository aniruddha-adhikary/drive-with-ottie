/**
 * Contract version frozen by F0. Additive changes bump CONTRACT_VERSION; breaking changes require
 * an orchestrator decision (see docs/implementation/CONTRACTS.md, "Change policy").
 */
export const CONTRACT_VERSION = 1 as const;

/** Serialised World/Scenario schema version. Independent of the TypeScript contract version. */
export const WORLD_SCHEMA_VERSION = 1 as const;

/** Extraction manifest schema version accepted by the manifest adapter (tools/asset_extraction/contract.py). */
export const EXTRACTION_MANIFEST_SCHEMA_VERSION = 1 as const;

/** Persisted learning-state schema version (device-local storage payloads). */
export const LEARNING_STATE_SCHEMA_VERSION = 1 as const;

export type ContractVersion = typeof CONTRACT_VERSION;
