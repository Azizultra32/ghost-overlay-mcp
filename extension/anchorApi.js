/**
 * @typedef {Object} MappedField
 * @property {string} label
 * @property {string} role
 * @property {string} selector
 * @property {boolean} editable
 * @property {boolean} visible
 */

/**
 * @typedef {Object} FillStep
 * @property {string} selector
 * @property {'setValue'} action
 * @property {string} value
 */

/**
 * @typedef {Object} FillPlan
 * @property {string} id
 * @property {string} createdAt
 * @property {FillStep[]} steps
 * @property {string} [note]
 */

/**
 * @typedef {Object} AnchorStatus
 * @property {'clinician'|'debug'} mode
 * @property {number} mappedCount
 * @property {string} [lastAction]
 */

/**
 * @typedef {Object} AnchorApi
 * @property {() => void} togglePanel
 * @property {() => Promise<{ fields: MappedField[] }>} map
 * @property {() => Promise<{ ok: boolean; fields: number }>} sendMap
 * @property {() => Promise<{ ok: boolean; plan?: FillPlan }>} fill
 * @property {() => void} undo
 * @property {() => AnchorStatus} getStatus
 */

// This file primarily serves as documentation and type definition in JS.
// The actual implementation is attached to window.Anchor in overlay.js
