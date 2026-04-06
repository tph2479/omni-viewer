import { JsonDB, Config } from 'node-json-db';
import fs from 'node:fs';
import path from 'node:path';

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

// Bạn sẽ có thể dùng nó sau này cho metadata của truyện như:
// export async function setMangaMetadata(id: string, metadata: any) {
//     await db.push(`/mangas/${id}/metadata`, metadata); // Cấu trúc lồng cực kỳ đơn giản
// }
