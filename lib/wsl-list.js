/**
 * Decode and parse `wsl.exe --list --verbose` output. Windows emits UTF-16 LE.
 * @module @Yujyf/dsh-remote-workspace
 */
/**
 * Decode `wsl.exe --list` bytes. The command writes UTF-16 LE, often with a BOM.
 * @param buffer - Raw stdout.
 * @returns decoded text with NULs stripped.
 */
export function decodeWslListOutput(buffer) {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.subarray(2).toString('utf16le');
    }
    if (buffer.length >= 4 && buffer[1] === 0 && buffer[3] === 0) {
        return buffer.toString('utf16le');
    }
    return buffer.toString('utf8');
}
const HEADER = /^\s*NAME\s+STATE\s+VERSION\s*$/i;
const ROW = /^\s*(\*)?\s*(\S.*?)\s+(Running|Stopped|Installing|Converting|Unknown)\s+(\d+)\s*$/i;
/**
 * Parse decoded `wsl.exe --list --verbose` text into distribution records.
 * @param text - Decoded list output.
 * @returns discovered distributions, default first when marked.
 */
export function parseWslList(text) {
    const distributions = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replaceAll('\0', '').trimEnd();
        if (line.length === 0 || HEADER.test(line.trim()))
            continue;
        const match = ROW.exec(line);
        const name = match?.[2];
        const stateCell = match?.[3];
        if (match === null || name === undefined || stateCell === undefined)
            continue;
        const versionNumber = Number(match[4]);
        const version = versionNumber === 1 ? 1 : 2;
        const stateRaw = stateCell.toLowerCase();
        const state = stateRaw === 'running'
            ? 'running'
            : stateRaw === 'stopped'
                ? 'stopped'
                : 'unknown';
        distributions.push({
            name: name.trim(),
            state,
            version,
            default: match[1] === '*',
        });
    }
    return distributions;
}
//# sourceMappingURL=wsl-list.js.map