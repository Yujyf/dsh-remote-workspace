/**
 * Behavior tests for the host view of a remote workspace: the path DSH's own
 * workspace registry stores, and the comparison that recognizes it again.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostPathOfWorkspace, uncPathsEqual, wslPathToUnc } from '../lib/path-mapper.js'
import { parseWorkspaceUri } from '../lib/uri.js'

test('a WSL workspace reaches the host registry through its UNC share', () => {
  assert.equal(
    hostPathOfWorkspace(parseWorkspaceUri('wsl://Ubuntu-26.04/home/cf220/test')),
    '\\\\wsl.localhost\\Ubuntu-26.04\\home\\cf220\\test',
  )
  assert.equal(hostPathOfWorkspace(parseWorkspaceUri('wsl://Ubuntu-26.04/')), '\\\\wsl.localhost\\Ubuntu-26.04\\')
})

test('a host-local workspace is its own host path', () => {
  assert.equal(hostPathOfWorkspace(parseWorkspaceUri('local://windows/C:/work')), 'C:\\work')
})

test('UNC comparison ignores separators, case, and a trailing slash', () => {
  assert.equal(uncPathsEqual('\\\\wsl.localhost\\Ubuntu\\home\\me', '\\\\wsl.localhost\\ubuntu\\home\\me\\'), true)
  assert.equal(uncPathsEqual('\\\\wsl.localhost\\Ubuntu\\home\\me', '\\\\wsl.localhost\\Ubuntu\\home\\other'), false)
})

test('the round trip through a registry path identifies the workspace again', () => {
  const uri = parseWorkspaceUri('wsl://Ubuntu-26.04/home/cf220/test')
  const hostPath = hostPathOfWorkspace(uri)
  assert.equal(uncPathsEqual(hostPath, wslPathToUnc('Ubuntu-26.04', '/home/cf220/test/')), true)
})
