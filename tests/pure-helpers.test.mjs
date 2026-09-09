/**
 * Behavior tests for the pure workspace-identity helpers, run against the
 * built package (`lib/`) — the exact files a profile installs.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultRemoteWorkspaceTitle,
  formatWorkspaceUri,
  normalizePosixPath,
  normalizeWindowsPath,
  parseWorkspaceUri,
  uriPathToWindowsPath,
  windowsPathToUriPath,
  workspaceUriEquals,
  workspaceUriFromNative,
  workspaceUriFromWslUnc,
} from '../lib/uri.js'
import { localPathMapper, windowsPathToWslMount, wslPathMapper, wslPathToUnc, wslPathToWindowsMount } from '../lib/path-mapper.js'
import { decodeWslListOutput, parseWslList } from '../lib/wsl-list.js'

const unsupported = (error) => error?.code === 'UNSUPPORTED'

test('normalizePosixPath collapses segments and keeps the root', () => {
  assert.equal(normalizePosixPath('/a//b/../c/'), '/a/c')
  assert.equal(normalizePosixPath('/'), '/')
  assert.equal(normalizePosixPath('/a/..'), '/')
})

test('normalizePosixPath rejects a relative path', () => {
  assert.throws(() => normalizePosixPath('relative/path'), unsupported)
})

test('normalizeWindowsPath uppercases the drive and drops the trailing slash', () => {
  assert.equal(normalizeWindowsPath('c:/a/../b\\'), 'C:\\b')
  assert.equal(normalizeWindowsPath('D:'), 'D:\\')
  assert.throws(() => normalizeWindowsPath('relative'), unsupported)
})

test('windows path and URI path round-trip', () => {
  assert.equal(windowsPathToUriPath('C:\\work dir\\sub'), '/C:/work dir/sub')
  assert.equal(uriPathToWindowsPath('/C:/work dir/sub'), 'C:\\work dir\\sub')
  assert.equal(uriPathToWindowsPath('/d:/'), 'D:\\')
  assert.throws(() => uriPathToWindowsPath('/home/x'), unsupported)
})

test('formatWorkspaceUri canonicalizes a WSL path', () => {
  assert.equal(formatWorkspaceUri('wsl', 'Ubuntu', '/home/x/'), 'wsl://Ubuntu/home/x')
  assert.equal(formatWorkspaceUri('wsl', 'Ubuntu', '/'), 'wsl://Ubuntu/')
})

test('parseWorkspaceUri canonicalizes local and WSL spellings', () => {
  assert.deepEqual(parseWorkspaceUri('local://windows/c:/work/'), {
    type: 'local',
    authority: 'windows',
    path: 'C:\\work',
    href: 'local://windows/C:/work',
  })
  assert.deepEqual(parseWorkspaceUri('wsl://Ubuntu/home/x/'), {
    type: 'wsl',
    authority: 'Ubuntu',
    path: '/home/x',
    href: 'wsl://Ubuntu/home/x',
  })
})

test('parseWorkspaceUri rejects a non-workspace or incomplete URI', () => {
  assert.throws(() => parseWorkspaceUri('http://example.test/x'), unsupported)
  assert.throws(() => parseWorkspaceUri('local://windows'), unsupported)
  assert.throws(() => parseWorkspaceUri('local:///C:/work'), unsupported)
})

test('workspaceUriFromNative keeps each world in its own path spelling', () => {
  assert.equal(workspaceUriFromNative('local', 'windows', 'C:\\work').href, 'local://windows/C:/work')
  assert.equal(workspaceUriFromNative('wsl', 'Ubuntu', '/home/x/').href, 'wsl://Ubuntu/home/x')
})

test('workspaceUriFromWslUnc recognizes both WSL UNC spellings', () => {
  assert.equal(workspaceUriFromWslUnc('\\\\wsl.localhost\\Ubuntu\\home\\x').href, 'wsl://Ubuntu/home/x')
  assert.equal(workspaceUriFromWslUnc('\\\\wsl$\\Ubuntu\\home\\x').href, 'wsl://Ubuntu/home/x')
  assert.equal(workspaceUriFromWslUnc('\\\\wsl.localhost\\Ubuntu').href, 'wsl://Ubuntu/')
  assert.equal(workspaceUriFromWslUnc('\\\\server\\share\\x'), undefined)
})

test('workspaceUriEquals ignores spelling that is not identity', () => {
  assert.equal(workspaceUriEquals('local://windows/c:/work/', 'local://windows/C:/work'), true)
  assert.equal(workspaceUriEquals('wsl://Ubuntu/home/x/', 'wsl://Ubuntu/home/x'), true)
  assert.equal(workspaceUriEquals('wsl://Ubuntu/home/x', 'wsl://Debian/home/x'), false)
})

test('defaultRemoteWorkspaceTitle names the final segment', () => {
  assert.equal(defaultRemoteWorkspaceTitle(parseWorkspaceUri('wsl://Ubuntu/home/cf220/proj')), 'proj')
  assert.equal(defaultRemoteWorkspaceTitle(parseWorkspaceUri('local://windows/C:/work')), 'work')
  assert.equal(defaultRemoteWorkspaceTitle(parseWorkspaceUri('wsl://Ubuntu/')), '/')
})

test('Windows drive mounts map both ways', () => {
  assert.equal(windowsPathToWslMount('C:\\Users\\x'), '/mnt/c/Users/x')
  assert.equal(windowsPathToWslMount('D:\\'), '/mnt/d')
  assert.equal(wslPathToWindowsMount('/mnt/c/Users/x'), 'C:\\Users\\x')
  assert.equal(wslPathToWindowsMount('/mnt/d'), 'D:\\')
  assert.equal(wslPathToWindowsMount('/home/x'), undefined)
})

test('WSL paths map to UNC spellings without becoming a backend path', () => {
  assert.equal(wslPathToUnc('Ubuntu', '/home/x'), '\\\\wsl.localhost\\Ubuntu\\home\\x')
  assert.equal(wslPathToUnc('Ubuntu', '/'), '\\\\wsl.localhost\\Ubuntu\\')
})

test('path mappers expose explicit conversion, never silent substitution', () => {
  assert.equal(localPathMapper().toHostPath('/a/b'), '/a/b')
  assert.equal(localPathMapper().toTargetPath('C:\\a'), 'C:\\a')
  assert.equal(wslPathMapper().toHostPath('/mnt/d/work'), 'D:\\work')
  assert.equal(wslPathMapper().toHostPath('/home/x'), undefined)
  assert.equal(wslPathMapper().toTargetPath('D:\\work'), '/mnt/d/work')
})

test('decodeWslListOutput reads the UTF-16 LE forms wsl.exe emits', () => {
  const text = '  NAME      STATE           VERSION\n* Ubuntu    Running         2\n'
  assert.equal(decodeWslListOutput(Buffer.from(text, 'utf16le')), text)
  assert.equal(decodeWslListOutput(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])), text)
  assert.equal(decodeWslListOutput(Buffer.from(text, 'utf8')), text)
})

test('parseWslList reads distributions, states, versions, and the default flag', () => {
  const parsed = parseWslList([
    '  NAME            STATE           VERSION',
    '* Ubuntu-22.04    Running         2',
    '  Debian          Stopped         1',
    '  Legacy          Installing      2',
    '',
    'garbage line without columns',
  ].join('\r\n'))
  assert.deepEqual(parsed, [
    { name: 'Ubuntu-22.04', state: 'running', version: 2, default: true },
    { name: 'Debian', state: 'stopped', version: 1, default: false },
    { name: 'Legacy', state: 'unknown', version: 2, default: false },
  ])
})
