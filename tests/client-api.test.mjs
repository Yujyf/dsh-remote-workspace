/**
 * Behavior tests for the browser transport: request shape, envelope parsing,
 * and the failures the model relies on being distinguishable.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RemoteWorkspaceApi } from '../lib/client/api.js'

/** Replace global fetch for one case and restore it afterwards. */
async function withFetch(handler, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return await handler(url, init)
  }
  try {
    return await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

/** A JSON response stand-in. */
function jsonResponse(status, body) {
  return { status, json: async () => body }
}

test('listTargets posts to the verb route and returns the value', async () => {
  const api = new RemoteWorkspaceApi()
  const targets = { targets: [{ id: 'local:windows', type: 'local', displayName: 'Windows', status: 'ready' }] }
  await withFetch(async () => jsonResponse(200, { ok: true, value: targets }), async calls => {
    const result = await api.listTargets()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/remote-workspace/api/listTargets')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].init.body), {})
    assert.equal(result.ok, true)
    assert.deepEqual(result.value, targets)
  })
})

test('a verb payload reaches the host verbatim', async () => {
  const api = new RemoteWorkspaceApi()
  await withFetch(async () => jsonResponse(200, { ok: true, value: { workspaces: [] } }), async calls => {
    await api.listDirectory({ targetId: 'wsl:Ubuntu', path: '/home/cf220' })
    assert.equal(calls[0].url, '/remote-workspace/api/listDirectory')
    assert.deepEqual(JSON.parse(calls[0].init.body), { targetId: 'wsl:Ubuntu', path: '/home/cf220' })
  })
})

test('a failure envelope keeps the host business code', async () => {
  const api = new RemoteWorkspaceApi()
  await withFetch(
    async () => jsonResponse(400, { ok: false, error: { code: 'remote-workspace/target-unavailable', message: 'no such distro' } }),
    async () => {
      const result = await api.healthCheck({ targetId: 'wsl:Missing' })
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'remote-workspace/target-unavailable')
      assert.equal(result.error.message, 'no such distro')
    },
  )
})

test('a transport failure is distinguishable from a host failure', async () => {
  const api = new RemoteWorkspaceApi()
  await withFetch(async () => { throw new Error('connection refused') }, async () => {
    const result = await api.listWorkspaces()
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'network')
    assert.equal(result.error.message, 'connection refused')
  })
})

test('a non-JSON response body reports the HTTP status', async () => {
  const api = new RemoteWorkspaceApi()
  await withFetch(
    async () => ({ status: 502, json: async () => { throw new Error('not json') } }),
    async () => {
      const result = await api.listTargets()
      assert.equal(result.ok, false)
      assert.equal(result.error.code, 'http')
      assert.equal(result.error.message, 'HTTP 502')
    },
  )
})

test('an unrecognized envelope reports the HTTP status instead of throwing', async () => {
  const api = new RemoteWorkspaceApi()
  await withFetch(async () => jsonResponse(200, { value: 'unexpected' }), async () => {
    const result = await api.removeWorkspace({ workspaceId: 'rw-1' })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'http')
  })
})
