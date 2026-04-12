import fs from 'node:fs';

// ─── ISOBMFF / HEIF magic-byte detection ─────────────────────────────────────

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'mif2', 'msf1', 'msf2', 'heis', 'hevm']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function readFtypBrand(buf: Buffer): { ftyp: string; brand: string } | null {
    if (buf.length < 12) return null;
    const hasValidBoxStart =
        (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00) ||
        (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00);
    if (!hasValidBoxStart) return null;
    const ftyp  = buf.subarray(4, 8).toString('ascii');
    const brand = buf.subarray(8, 12).toString('ascii').trim().toLowerCase();
    return { ftyp, brand };
}

export function isAvifBuffer(buf: Buffer): boolean {
    const parsed = readFtypBrand(buf);
    if (!parsed || parsed.ftyp !== 'ftyp') return false;
    if (AVIF_BRANDS.has(parsed.brand)) return true;

    // Also scan compatible brands list inside the ftyp box
    const boxSize = buf.readUInt32BE(0);
    const maxScan = Math.min(boxSize, buf.length);
    for (let i = 16; i + 4 <= maxScan; i += 4) {
        const b = buf.subarray(i, i + 4).toString('ascii').trim().toLowerCase();
        if (AVIF_BRANDS.has(b)) return true;
    }
    return false;
}

export function isHeicBuffer(buf: Buffer): boolean {
    if (isAvifBuffer(buf)) return false;
    const parsed = readFtypBrand(buf);
    if (!parsed || parsed.ftyp !== 'ftyp') return false;
    return HEIC_BRANDS.has(parsed.brand);
}

export function isHeifBuffer(buf: Buffer): boolean {
    if (isAvifBuffer(buf)) return false;
    const parsed = readFtypBrand(buf);
    if (!parsed || parsed.ftyp !== 'ftyp') return false;
    return HEIC_BRANDS.has(parsed.brand);
}

// ─── File-based real-type detection ──────────────────────────────────────────

/**
 * Detects the real image format of a file by reading its first 256 bytes.
 * Use when the file extension alone cannot be trusted.
 */
export async function detectImageRealType(absolutePath: string): Promise<{ isHeic: boolean; isAvif: boolean }> {
    try {
        const header = Buffer.alloc(256);
        const fd = await new Promise<number>((resolve, reject) => {
            fs.open(absolutePath, 'r', (err, fd) => (err ? reject(err) : resolve(fd)));
        });
        await new Promise<void>((resolve, reject) => {
            fs.read(fd, header, 0, 256, 0, (err) => (err ? reject(err) : resolve()));
        });
        await new Promise<void>((resolve, reject) => {
            fs.close(fd, (err) => (err ? reject(err) : resolve()));
        });

        return { isHeic: isHeifBuffer(header), isAvif: isAvifBuffer(header) };
    } catch {
        return { isHeic: false, isAvif: false };
    }
}
