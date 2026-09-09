/**
 * Decode and parse `wsl.exe --list --verbose` output. Windows emits UTF-16 LE.
 * @module @Yujyf/dsh-remote-workspace
 */
import type { WslDistribution } from './types.ts';
/**
 * Decode `wsl.exe --list` bytes. The command writes UTF-16 LE, often with a BOM.
 * @param buffer - Raw stdout.
 * @returns decoded text with NULs stripped.
 */
export declare function decodeWslListOutput(buffer: Buffer): string;
/**
 * Parse decoded `wsl.exe --list --verbose` text into distribution records.
 * @param text - Decoded list output.
 * @returns discovered distributions, default first when marked.
 */
export declare function parseWslList(text: string): WslDistribution[];
//# sourceMappingURL=wsl-list.d.ts.map