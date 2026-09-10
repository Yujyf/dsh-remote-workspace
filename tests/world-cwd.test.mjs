/**
 * Behavior tests for the cwd translation that makes a bound session work in its
 * remote world instead of in the host directory it was created in.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sameHostPath, worldCwd } from '../lib/world-cwd.js'

const bindings = {
  wsl: { cwd: '/home/cf220/test', sourceCwd: 'E:\\work\\project' },
  unboundSource: { cwd: '/home/cf220/test' },
}

test('a POSIX cwd is already native and passes through', () => {
  assert.equal(worldCwd(bindings.wsl, '/etc'), '/etc')
  assert.equal(worldCwd(bindings.wsl, '/home/cf220/test/src'), '/home/cf220/test/src')
})

test("the session's own directory becomes the bound workspace", () => {
  assert.equal(worldCwd(bindings.wsl, 'E:\\work\\project'), '/home/cf220/test')
  assert.equal(worldCwd(bindings.wsl, 'e:/WORK/project/'), '/home/cf220/test')
  assert.equal(worldCwd(bindings.wsl, 'E:\\work\\project\\'), '/home/cf220/test')
})

test('any other host path keeps its drive mapping', () => {
  assert.equal(worldCwd(bindings.wsl, 'C:\\Users\\me'), '/mnt/c/Users/me')
  assert.equal(worldCwd(bindings.wsl, 'E:\\work\\other'), '/mnt/e/work/other')
})

test('a cwd with no world spelling falls back to the workspace directory', () => {
  assert.equal(worldCwd(bindings.wsl, 'relative/dir'), '/home/cf220/test')
  assert.equal(worldCwd(bindings.wsl, ''), '/home/cf220/test')
  assert.equal(worldCwd(bindings.wsl, undefined), '/home/cf220/test')
})

test('without a recorded session directory nothing is substituted', () => {
  assert.equal(worldCwd(bindings.unboundSource, 'E:\\work\\project'), '/mnt/e/work/project')
  assert.equal(worldCwd(bindings.unboundSource, undefined), '/home/cf220/test')
})

test('host path equality ignores separators, case, and trailing slashes', () => {
  assert.equal(sameHostPath('E:\\Work\\Project', 'e:/work/project/'), true)
  assert.equal(sameHostPath('E:\\work\\project', 'E:\\work\\other'), false)
})
