"use strict";
/**
 * Librarian change plan types.
 * Represents proposed changes to organize daily notes into the vault.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidChangePlan = isValidChangePlan;
/** Validate that a change plan has required fields */
function isValidChangePlan(plan) {
    if (!plan || typeof plan !== 'object')
        return false;
    const p = plan;
    if (!Array.isArray(p.processedNotes))
        return false;
    if (!Array.isArray(p.actions))
        return false;
    if (typeof p.summary !== 'string')
        return false;
    // Validate each action
    for (const action of p.actions) {
        if (!isValidAction(action))
            return false;
    }
    return true;
}
function isValidAction(action) {
    if (!action || typeof action !== 'object')
        return false;
    const a = action;
    switch (a.type) {
        case 'create':
            return typeof a.path === 'string' && typeof a.content === 'string';
        case 'update':
            return (typeof a.path === 'string' &&
                typeof a.content === 'string' &&
                ['append', 'prepend', 'section'].includes(a.position));
        case 'move':
            return typeof a.fromPath === 'string' && typeof a.toPath === 'string';
        default:
            return false;
    }
}
