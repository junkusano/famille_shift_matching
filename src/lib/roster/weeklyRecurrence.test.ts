import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldDeployTemplateOnDate } from './weeklyRecurrence'

const template = (overrides: Partial<Parameters<typeof shouldDeployTemplateOnDate>[0]> = {}) => ({
  weekday: 1, active: true, effective_from: '2026-07-06', effective_to: null,
  is_biweekly: false, nth_weeks: null, ...overrides,
})

test('weekly template includes every matching weekday', () => {
  for (const date of ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']) {
    assert.equal(shouldDeployTemplateOnDate(template(), date, null).include, true)
  }
})

test('biweekly template keeps a 14-day cadence across a month boundary', () => {
  const recurring = template({ is_biweekly: true })
  assert.equal(shouldDeployTemplateOnDate(recurring, '2026-08-03', '2026-07-20').include, true)
  assert.equal(shouldDeployTemplateOnDate(recurring, '2026-08-10', '2026-07-20').include, false)
  assert.equal(shouldDeployTemplateOnDate(recurring, '2026-08-17', '2026-07-20').include, true)
})

test('nth_weeks takes precedence over biweekly', () => {
  const constrained = template({ is_biweekly: true, nth_weeks: [1, 3] })
  assert.equal(shouldDeployTemplateOnDate(constrained, '2026-08-03', '2026-07-20').include, true)
  assert.equal(shouldDeployTemplateOnDate(constrained, '2026-08-10', '2026-07-20').include, false)
  assert.equal(shouldDeployTemplateOnDate(constrained, '2026-08-17', '2026-07-20').include, true)
})

test('inactive templates and anchorless biweekly templates are not deployed', () => {
  assert.equal(shouldDeployTemplateOnDate(template({ active: false }), '2026-08-03', null).include, false)
  const result = shouldDeployTemplateOnDate(template({ is_biweekly: true, effective_from: null }), '2026-08-03', null)
  assert.equal(result.include, false)
  assert.ok(result.reason)
})
