import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { certificateCodes } from '../src/render/certificate'
import { ASSETS } from '../src/assets'

const TEMPLATES = path.join(ASSETS, 'templates')
const slideMap = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'slide-map.json'), 'utf-8'))
const layouts = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'certificate-layouts.json'), 'utf-8'))

/**
 * The layouts are generated, so these tests guard the *generation* — that the
 * committed JSON still covers every code and still carries the details a naive
 * parse would have dropped. See PLAN.md §11.
 */
describe('certificate layouts', () => {
    const codes = certificateCodes()

    test('every code in the slide map has a layout', () => {
        for (const type of ['promotion', 'award'] as const) {
            for (const code of Object.keys(slideMap[type].map)) {
                assert.ok(codes[type].includes(code), `${type}/${code} has no layout`)
            }
        }
    })

    test('the two formats keep their distinct dimensions', () => {
        // 222 reference promotions are 906x1232 portrait; 121 awards are 1535x925.
        assert.equal(layouts.promotion.pixels.w, 906)
        assert.equal(layouts.award.pixels.w, 1535)
        assert.ok(layouts.promotion.pixels.h > layouts.promotion.pixels.w, 'promotions are portrait')
        assert.ok(layouts.award.pixels.h < layouts.award.pixels.w, 'awards are landscape')
    })

    test('placeholders survive the run-merge intact', () => {
        // {dateNumber} arrives split across three <a:t> elements; if merging
        // regresses, braces end up orphaned in separate runs.
        const seen = new Set<string>()
        for (const type of ['promotion', 'award'] as const) {
            for (const cert of Object.values(layouts[type].certificates) as any[]) {
                for (const el of cert.elements) {
                    if (el.kind !== 'text') continue
                    for (const p of el.paragraphs) for (const r of p.runs) {
                        for (const m of r.text.matchAll(/\{(\w+)\}/g)) seen.add(m[1])
                        const braces = (r.text.match(/[{}]/g) ?? []).length
                        const pairs = (r.text.match(/\{\w+\}/g) ?? []).length * 2
                        assert.equal(braces, pairs, `orphaned brace in run: ${JSON.stringify(r.text)}`)
                    }
                }
            }
        }
        for (const key of ['name', 'date', 'dateNumber', 'suffix', 'signaturer']) {
            assert.ok(seen.has(key), `placeholder {${key}} vanished from the layouts`)
        }
    })

    test('line breaks are preserved', () => {
        // The three-line signature block collapses to one if <a:br/> is dropped.
        let withBreaks = 0
        for (const type of ['promotion', 'award'] as const) {
            for (const cert of Object.values(layouts[type].certificates) as any[]) {
                for (const el of cert.elements) {
                    if (el.kind !== 'text') continue
                    for (const p of el.paragraphs) for (const r of p.runs) {
                        if (r.text.includes('\n')) withBreaks++
                    }
                }
            }
        }
        assert.ok(withBreaks > 100, `expected many line breaks, found ${withBreaks}`)
    })

    test('artwork placement is present, including rotation and crop', () => {
        // The parchment and frame are rotated 90 degrees onto portrait, and the
        // frame is cropped to trim its transparent padding. Losing either makes
        // the certificate visibly wrong.
        const returnCert = layouts.promotion.certificates['RETURN']
        const pictures = returnCert.elements.filter((e: any) => e.kind === 'picture')
        assert.ok(pictures.length >= 4, 'expected the art layers to be placed')
        assert.ok(pictures.some((p: any) => p.rotation === 90), 'expected a 90-degree rotated layer')
        assert.ok(pictures.some((p: any) => p.crop !== null), 'expected a cropped layer')
    })

    test('every referenced media file was unpacked', () => {
        for (const type of ['promotion', 'award'] as const) {
            const dir = path.join(TEMPLATES, layouts[type].mediaDir)
            for (const cert of Object.values(layouts[type].certificates) as any[]) {
                for (const el of cert.elements) {
                    if (el.kind !== 'picture') continue
                    assert.ok(fs.existsSync(path.join(dir, el.media)), `missing media ${type}/${el.media}`)
                }
            }
        }
    })
})
