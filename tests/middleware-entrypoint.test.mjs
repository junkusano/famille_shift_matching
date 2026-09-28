import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Next middleware uses the named middleware entrypoint export', async () => {
  const source = await readFile(new URL('../middleware.ts', import.meta.url), 'utf8')

  assert.match(source, /export\s+async\s+function\s+middleware/)
  assert.doesNotMatch(source, /export\s+default\s+async\s+function\s+middleware/)
})
