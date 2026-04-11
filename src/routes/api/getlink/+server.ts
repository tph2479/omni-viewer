import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { spawn } from "child_process";
import { getDefaultAppPath } from "$lib/server/database/db";
import { join } from "path";

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { url, type } = await request.json();

        if (!url || !type) {
            return json({ error: "Thiếu thông tin yêu cầu" }, { status: 400 });
        }

        // Lấy đường dẫn mặc định
        const basePath = await getDefaultAppPath();
        let targetPath: string;
        let command: string;
        let args: string[];

        switch (type) {
            case "image":
                targetPath = join(basePath, "Images");
                command = "gdl.exe";
                args = [url, "-d", targetPath];
                break;
            case "video":
                targetPath = join(basePath, "Videos");
                command = "yt-dlp";
                args = [url, "-P", targetPath];
                break;
            case "audio":
                targetPath = join(basePath, "Music");
                command = "yt-dlp";
                args = [url, "-x", "--audio-format", "mp3", "-P", targetPath];
                break;
            default:
                return json({ error: "Loại media không hợp lệ" }, { status: 400 });
        }

        // Thực thi lệnh
        return new Promise((resolve) => {
            const process = spawn(command, args);

            let output = "";
            let errorOutput = "";

            process.stdout.on("data", (data) => {
                output += data.toString();
            });

            process.stderr.on("data", (data) => {
                errorOutput += data.toString();
            });

            process.on("close", (code) => {
                if (code === 0) {
                    resolve(json({
                        success: true,
                        message: "Tải xuống thành công",
                        filePath: targetPath,
                        output: output
                    }));
                } else {
                    resolve(json({
                        error: `Lỗi khi tải xuống (code: ${code})`,
                        details: errorOutput || output
                    }, { status: 500 }));
                }
            });

            process.on("error", (err) => {
                resolve(json({
                    error: `Không thể thực thi lỗi: ${err.message}`,
                    command: command
                }, { status: 500 }));
            });
        });

    } catch (e) {
        return json({ error: String(e) }, { status: 500 });
    }
};