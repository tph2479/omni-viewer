import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { spawn } from "child_process";
import { getDefaultAppPath } from "$lib/server/database/db";
import { join } from "path";

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { url, type, options = {} } = body;

        if (!url || !type) {
            return json({ error: "Missing request information" }, { status: 400 });
        }

        const basePath = await getDefaultAppPath();
        if (!basePath) {
            return json({ error: "Server storage path not configured" }, { status: 500 });
        }

        let targetPath: string;
        let command: string;
        let args: string[] = [];

        switch (type) {
            case "image":
                targetPath = join(basePath, "Images");
                command = "gdl.exe";
                args.push(url, "-d", targetPath);
                if (options.username && options.password) {
                    args.push("--username", options.username, "--password", options.password);
                }
                if (options.chapterRange) {
                    args.push("--chapter-filter", options.chapterRange);
                }
                break;

            case "video":
                targetPath = join(basePath, "Videos");
                command = "yt-dlp";
                args.push(url, "-P", targetPath);
                args.push(options.playlist ? "--yes-playlist" : "--no-playlist");
                if (options.resolution && options.resolution !== "best") {
                    args.push("-f", `bestvideo[height<=${options.resolution}]+bestaudio/best[height<=${options.resolution}]/best`);
                }
                if (options.subtitles) {
                    args.push("--write-subs", "--write-auto-subs", "--embed-subs");
                }
                break;

            case "audio":
                targetPath = join(basePath, "Music");
                command = "yt-dlp";
                args.push(url, "-x", "-P", targetPath);
                args.push("--audio-format", options.format || "mp3");
                args.push(options.playlist ? "--yes-playlist" : "--no-playlist");
                if (options.embedThumbnail) {
                    args.push("--embed-thumbnail");
                }
                break;

            case "thumbnail":
                targetPath = join(basePath, "Images");
                command = "yt-dlp";
                args.push(url, "--skip-download", "--write-thumbnail", "--convert-thumbnails", "jpg", "-P", targetPath);
                args.push("--no-playlist"); // Individual thumbnail by default
                break;

            default:
                return json({ error: "Invalid media type" }, { status: 400 });
        }

        if (options.extraArgs) {
            const extraArgsArray = options.extraArgs
                .split(" ")
                .map((arg: string) => arg.trim())
                .filter((arg: string) => arg.length > 0);
            args.push(...extraArgsArray);
        }

        // SSE Streaming response
        const stream = new ReadableStream({
            start(controller) {
                const enc = new TextEncoder();
                const send = (data: object) => {
                    controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                const proc = spawn(command, args);

                proc.stdout.on("data", (chunk: Buffer) => {
                    const lines = chunk.toString().split("\n");
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) send({ type: "output", line: trimmed });
                    }
                });

                proc.stderr.on("data", (chunk: Buffer) => {
                    const lines = chunk.toString().split("\n");
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed) send({ type: "output", line: trimmed });
                    }
                });

                proc.on("close", (code) => {
                    if (code === 0) {
                        send({ type: "done", success: true, message: "Download successful", filePath: targetPath });
                    } else {
                        send({ type: "done", success: false, message: `Download failed (exit code ${code})` });
                    }
                    controller.close();
                });

                proc.on("error", (err) => {
                    send({ type: "done", success: false, message: `Failed to execute command: ${err.message}` });
                    controller.close();
                });
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });

    } catch (e) {
        return json({ error: String(e) }, { status: 500 });
    }
};