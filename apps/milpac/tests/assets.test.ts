import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import { preflight, ribbonIndex, boxMedalIndex, corpsIndex, embellishIndex, files } from '../src/assets'
import { BADGES } from '@asot/lib'

/**
 * The preflight is what turns "a uniform silently rendered wrong" into "the
 * service refused to start". Running it as a test means an asset regression
 * fails CI rather than production boot.
 */
describe('asset preflight', () => {
    const result = preflight()

    test('reports no errors', () => {
        assert.deepEqual(result.errors, [], `preflight errors:\n  ${result.errors.join('\n  ')}`)
    })

    test('reports no warnings', () => {
        assert.deepEqual(result.warnings, [], `preflight warnings:\n  ${result.warnings.join('\n  ')}`)
    })

    test('every fixed asset exists', () => {
        for (const [key, file] of Object.entries(files)) {
            assert.ok(fs.existsSync(file), `${key} missing at ${file}`)
        }
    })

    test('every corps badge exists', () => {
        for (const badge of BADGES) {
            assert.ok(corpsIndex.has(badge), `corps badge ${badge} missing`)
        }
    })

    test('only Command has an ornate general variant', () => {
        // Documenting reality rather than asserting an ideal: Command2 is the
        // only `${badge}2` that was ever drawn. The renderer falls back to the
        // plain badge for the rest, so a general outside India Company HQ gets
        // their corps badge instead of a 422.
        assert.ok(corpsIndex.has('Command2'))
        const ornate = BADGES.filter(b => corpsIndex.has(`${b}2`))
        assert.deepEqual(ornate, ['Command'], `unexpected ornate variants: ${ornate.join(', ')}`)
    })

    test('both rifleman badge variants exist', () => {
        assert.ok(embellishIndex.has('PTE'))
        assert.ok(embellishIndex.has('PTEP'))
    })

    test('every citation in medals.json has a ribbon and a box medal', () => {
        const medals = JSON.parse(fs.readFileSync(files.medalsJson, 'utf-8')) as Record<string, string[]>
        for (const [line, citations] of Object.entries(medals)) {
            for (const citation of citations) {
                assert.ok(ribbonIndex.has(citation), `${line}: no ribbon for ${citation}`)
                assert.ok(boxMedalIndex.has(citation), `${line}: no box medal for ${citation}`)
            }
        }
    })
})
