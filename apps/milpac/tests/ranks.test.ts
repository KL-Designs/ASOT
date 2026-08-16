import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRankAsset, RANK_TO_ASSET, rankIndex } from '../src/assets'

/**
 * `RANK_TO_ASSET` is the only place a rank becomes a filename, and every entry
 * in it exists because something went wrong without it — see PLAN.md §10. These
 * tests pin the decisions so a future tidy-up can't quietly undo them.
 */
describe('resolveRankAsset', () => {
    test('strips parentheses by default', () => {
        assert.equal(resolveRankAsset('PTE(S)'), 'PTES')
        assert.equal(resolveRankAsset('CPL(J)'), 'CPLJ')
        assert.equal(resolveRankAsset('GM(D)'), 'GMD')
    })

    test('passes through ranks that need no transformation', () => {
        assert.equal(resolveRankAsset('SGT'), 'SGT')
        assert.equal(resolveRankAsset('BRIG'), 'BRIG')
    })

    test('returns null for ranks that intentionally draw no insignia', () => {
        // The rifleman badge carries the tier for these instead.
        for (const rank of ['REC', 'PTE', 'PTE(P)']) {
            assert.equal(resolveRankAsset(rank), null, `${rank} should draw no insignia`)
        }
    })

    test('corps base and Proficient tiers draw no insignia', () => {
        // Forced by the asset set: only L/S/SL tiers of each corps were drawn.
        for (const rank of ['SAP', 'SAP(P)', 'GNR', 'GNR(P)', 'TPR', 'TPR(P)']) {
            assert.equal(resolveRankAsset(rank), null, `${rank} should draw no insignia`)
        }
    })

    test('corps L/S/SL tiers render their own artwork', () => {
        // This is the §3 bug: both prior implementations rendered nothing here.
        assert.equal(resolveRankAsset('TPR(L)'), 'TPRL')
        assert.equal(resolveRankAsset('SAP(SL)'), 'SAPSL')
        assert.equal(resolveRankAsset('GNR(S)'), 'GNRS')
    })

    test('signallers fall back to the PTE tier equivalents (decision 3a)', () => {
        // No SIG artwork exists at any tier.
        assert.equal(resolveRankAsset('SIG(L)'), 'PTEL')
        assert.equal(resolveRankAsset('SIG(S)'), 'PTES')
        assert.equal(resolveRankAsset('SIG(SL)'), 'PTESL')
        assert.equal(resolveRankAsset('SIG'), null)
        assert.equal(resolveRankAsset('SIG(P)'), null)
    })

    test('base GM reuses the Proficient artwork (decision 3c)', () => {
        assert.equal(resolveRankAsset('GM'), 'GMP')
        assert.equal(resolveRankAsset('GM(P)'), 'GMP')
    })

    test('separators that survive parenthesis-stripping are mapped explicitly', () => {
        // A slash or hyphen would otherwise be looked up as part of the filename.
        assert.equal(resolveRankAsset('B/SGT'), 'BSGT')
        assert.equal(resolveRankAsset('T/SGM'), 'TSGM')
        assert.equal(resolveRankAsset('RSM-A'), 'RSMA')
    })

    test('art filed under a different abbreviation is mapped explicitly', () => {
        assert.equal(resolveRankAsset('LT(S)'), 'SLT')
        assert.equal(resolveRankAsset('LT(C)'), 'CLT')
        assert.equal(resolveRankAsset('LM(S)'), 'SLM')
        assert.equal(resolveRankAsset('FLT(S)'), 'SFLT')
        assert.equal(resolveRankAsset('LBDR(S)'), 'LDBRS')
    })

    test('prefers the Airforce* folders over the retired Rank/ root (decision 3d)', () => {
        assert.equal(resolveRankAsset('WGCO'), 'WGCDR')
        assert.equal(resolveRankAsset('GPCAPT'), 'GCPT')
    })

    test('an unknown rank is undefined, so the route can 422 rather than 500', () => {
        assert.equal(resolveRankAsset('NOT_A_RANK'), undefined)
        assert.equal(resolveRankAsset('PTE(Z)'), undefined)
    })

    test('an empty rank draws no insignia rather than failing', () => {
        assert.equal(resolveRankAsset(''), null)
    })

    test('every non-null mapping target exists on disk', () => {
        for (const [rank, asset] of Object.entries(RANK_TO_ASSET)) {
            if (asset === null) continue
            assert.ok(rankIndex.has(asset), `${rank} maps to ${asset}.png, which is missing`)
        }
    })
})
