import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { spawn } from "child_process";

export const GET: RequestHandler = async ({ url }) => {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
        return json({ error: "Missing url parameter" }, { status: 400 });
    }

    return new Promise((resolve) => {
        // yt-dlp --dump-json is fast and works for most video/audio URLs
        const proc = spawn("yt-dlp", [
            "--dump-json",
            "--no-playlist",
            "--no-download",
            targetUrl,
        ]);

        let stdout = "";
        let timedOut = false;

        const timeout = setTimeout(() => {
            timedOut = true;
            proc.kill();
            resolve(json({ error: "Metadata fetch timed out" }, { status: 408 }));
        }, 15000);

        proc.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });

        proc.on("close", (code) => {
            clearTimeout(timeout);
            if (timedOut) return;
            if (code === 0 && stdout) {
                try {
                    const meta = JSON.parse(stdout.split("\n").find(l => l.trim().startsWith("{")) ?? stdout);
                    resolve(json({
                        thumbnail: meta.thumbnail ?? null,
                        title: meta.title ?? null,
                        uploader: meta.uploader ?? meta.channel ?? null,
                        duration: meta.duration ?? null,
                        extractor: meta.extractor_key ?? null,
                    }));
                } catch {
                    resolve(json({ error: "Failed to parse metadata" }, { status: 500 }));
                }
            } else {
                resolve(json({ error: "Could not fetch metadata for this URL" }, { status: 422 }));
            }
        });

        proc.on("error", (err) => {
            clearTimeout(timeout);
            if (!timedOut) {
                resolve(json({ error: `yt-dlp error: ${err.message}` }, { status: 500 }));
            }
        });
    });
};
