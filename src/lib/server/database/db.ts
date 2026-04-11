import { JsonDB, Config } from 'node-json-db';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Đảm bảo thư mục thiết lập database có tồn tại
const dbDir = path.resolve(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Khởi tạo database
// Tham số Config(tên_file, lưu_tự_động, dễ_đọc_bởi_người, dấu_phân_cách)
// Tên file: db sẽ tự động thêm đuôi .json thành "settings.json"
const db = new JsonDB(new Config(path.join(dbDir, 'settings'), true, true, '/'));

/**
 * Láy đường dẫn mặc định của ứng dụng
 * @returns Đường dẫn thư mục hoặc null nếu chưa có
 */
export async function getDefaultAppPath(): Promise<string | null> {
    try {
        const raw = await db.getData("/settings/defaultAppPath");
        if (typeof raw !== 'string' || !raw) return null;
        return raw.replace(/^([A-Za-z]:\\)\1+/i, '$1');
    } catch (error) {
        // Thư viện sẽ throw error thay vì trả về undefined khi không tìm thấy node
        return null;
    }
}

/**
 * Lưu hoặc cập nhật đường dẫn mặc định của ứng dụng
 * @param appPath Đường dẫn mới
 */
export async function setDefaultAppPath(appPath: string): Promise<void> {
    try {
        // Lưu vào trong nhánh settings > defaultAppPath
        await db.push("/settings/defaultAppPath", appPath);
    } catch (error) {
        console.error("Critical: Failed to save to JsonDB at /settings/defaultAppPath", error);
        throw error;
    }
}

/**
 * Tìm kiếm đường dẫn của một công cụ trong hệ thống (system PATH)
 * @param toolName Tên công cụ (ví dụ: 'yt-dlp', 'ffmpeg', 'gallery-dl')
 * @returns Đường dẫn đến file thực thi hoặc null nếu không tìm thấy
 */
function findInSystemPath(toolName: string): string | null {
    try {
        const command = process.platform === 'win32' ? `where ${toolName}` : `which ${toolName}`;
        const stdout = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const lines = stdout.trim().split(/\r?\n/);
        return lines.length > 0 ? lines[0].trim() : null;
    } catch {
        return null;
    }
}

/**
 * Lấy đường dẫn của công cụ từ database hoặc system PATH
 * Logic:
 * 1. Nếu trong DB có path và path đó hợp lệ -> Dùng DB path
 * 2. Nếu DB empty -> Tìm trong system PATH -> Nếu thấy, lưu vào DB và trả về
 * 3. Nếu DB có path nhưng invalid -> Fallback tìm trong system PATH
 * 4. Nếu không thấy đâu cả -> Trả về tên công cụ mặc định (để process vẫn thử chạy)
 */
export async function getToolPath(toolName: string): Promise<string> {
    const dbPath = `/settings/${toolName}Path`;
    try {
        let savedPath: string | null = null;
        try {
            savedPath = await db.getData(dbPath);
        } catch {
            // Node không tồn tại
        }

        // 1. Nếu có trong DB và hợp lệ
        if (savedPath && fs.existsSync(savedPath)) {
            return savedPath;
        }

        // 2 & 3. Nếu DB empty hoặc invalid, tìm trong system PATH
        const systemPath = findInSystemPath(toolName);
        if (systemPath) {
            // 2. Nếu DB empty, tự động lưu (persist)
            if (!savedPath) {
                await db.push(dbPath, systemPath);
            }
            return systemPath;
        }

        // 4. Fallback cuối cùng
        return "";
    } catch (error) {
        return "";
    }
}

/**
 * Lưu đường dẫn công cụ (manual override)
 */
export async function saveToolPath(toolName: string, toolPath: string): Promise<void> {
    try {
        await db.push(`/settings/${toolName}Path`, toolPath);
    } catch (error) {
        console.error(`Failed to save ${toolName} path:`, error);
        throw error;
    }
}
