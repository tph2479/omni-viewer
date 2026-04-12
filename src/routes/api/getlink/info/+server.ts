import type { RequestHandler } from "./$types";
import { spawn } from "node:child_process";
import { getToolPath } from '$lib/server/database/database';

export const GET: RequestHandler = async ({ url }) => {
    const targetUrl = url.searchParams.get("url");
    const mediaType = url.searchParams.get("type"); 
    const isPlaylist = url.searchParams.get("playlist") === "true";

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url parameter" }), { status: 400 });
    }

    const ytDlpPath = await getToolPath("yt-dlp");
    const galleryDlPath = await getToolPath("gallery-dl");
    const ffmpegPath = await getToolPath("ffmpeg");

    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder();
            const send = (data: object) => {
                try {
                    controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                    // Controller might be closed
                }
            };

            function getSmallestThumbnail(metaObj: any) {
                if (metaObj.thumbnails && Array.isArray(metaObj.thumbnails) && metaObj.thumbnails.length > 0) {
                    const sorted = [...metaObj.thumbnails].sort((a, b) => {
                        const areaA = (a.width || 0) * (a.height || 0);
                        const areaB = (b.width || 0) * (b.height || 0);
                        return areaA - areaB;
                    });
                    return sorted[0].url || sorted[0].filepath || null;
                }
                return metaObj.thumbnail || null;
            }

            const sentEntries = new Set<string>();

            function getCanonicalKey(e: any): string | null {
                if (e._type === "thumbnail" || e._type === "comment" || e._type === "subtitle") return null;
                let id = e.id;
                let url = e.url || e.webpage_url;
                let extractor = (e.extractor_key || e.extractor || "generic").toLowerCase();

                if (extractor.includes("youtube") || (url && /youtube\.com|youtu\.be/.test(url))) {
                    if (url) {
                        const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
                        if (match) id = match[1];
                    }
                }
                if (!id && !url) return e.title || null;
                return `${extractor}:${id || url}`;
            }

            function sendEntry(e: any) {
                const key = getCanonicalKey(e);
                if (!key || sentEntries.has(key)) return;
                sentEntries.add(key);
                send({
                    type: "entry",
                    data: {
                        title: e.title || "No Title",
                        thumbnail: getSmallestThumbnail(e),
                        url: (e.url || e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null)),
                        duration: e.duration || null,
                    }
                });
            }

            let toolToUse = ytDlpPath;
            let args: string[] = [];
            if (ytDlpPath) {
                args = ["--dump-json", "--no-download", "--ignore-config", "--no-warnings", "--flat-playlist", targetUrl!];
                if (ffmpegPath) args.push("--ffmpeg-location", ffmpegPath);
                if (isPlaylist) {
                    args.push("--yes-playlist");
                } else {
                    args.push("--no-playlist");
                }
            } else if (galleryDlPath && (mediaType === "image")) {
                toolToUse = galleryDlPath;
                args = ["-j", targetUrl!];
            } else {
                send({ type: "error", message: "No tool found" });
                controller.close();
                return;
            }

            const proc = spawn(toolToUse, args);
            
            let watchdog: ReturnType<typeof setTimeout>;
            function resetWatchdog() {
                if (watchdog) clearTimeout(watchdog);
                watchdog = setTimeout(() => {
                    try { proc.kill(); } catch {}
                    send({ type: "error", message: "Scanner timed out (No data received)" });
                    controller.close();
                }, 60000); 
            }
            resetWatchdog();

            let buffer = "";
            let errBuffer = "";
            let metaSent = false;

            proc.stdout.on("data", (chunk) => {
                resetWatchdog();
                buffer += chunk.toString().replace(/^\uFEFF/g, "");
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (!parsed) continue;

                        if (parsed._type === "playlist") {
                            send({
                                type: "meta",
                                data: {
                                    title: (parsed.playlist_title || parsed.playlist || parsed.title) || "Unknown Playlist",
                                    thumbnail: getSmallestThumbnail(parsed),
                                    uploader: parsed.uploader || parsed.channel || null,
                                    duration: parsed.duration || null,
                                    extractor: parsed.extractor_key || parsed.extractor || null,
                                    total: parsed.playlist_count || parsed.n_entries || null
                                }
                            });
                            metaSent = true;
                            // Re-enable safety: process initial entries but rely on Set for de-duplication
                            if (parsed.entries && Array.isArray(parsed.entries)) {
                                for (const e of parsed.entries) { if (e) sendEntry(e); }
                            }
                        } 
                        else if (parsed._type === "url" || parsed._type === "url_transparent" || (!isPlaylist && (parsed.id || parsed.title))) {
                            if (!metaSent) {
                                send({
                                    type: "meta",
                                    data: {
                                        title: (isPlaylist ? (parsed.playlist_title || parsed.playlist) : parsed.title) || parsed.title || "Loading...",
                                        thumbnail: getSmallestThumbnail(parsed),
                                        uploader: parsed.uploader || parsed.channel || null,
                                        duration: parsed.duration || null,
                                        extractor: parsed.extractor_key || parsed.extractor || null,
                                        total: isPlaylist ? (parsed.playlist_count || parsed.n_entries || null) : 1
                                    }
                                });
                                metaSent = true;
                            }
                            sendEntry(parsed);
                        }
                    } catch { /* junk */ }
                }
            });

            proc.stderr.on("data", (chunk) => {
                resetWatchdog();
                errBuffer += chunk.toString();
            });

            proc.on("close", (code) => {
                clearTimeout(watchdog);
                if (code !== 0) {
                    const cleanErr = errBuffer.trim();
                    if (cleanErr) {
                        send({ type: "error", message: cleanErr.split('\n').pop() || "yt-dlp error" });
                    } else if (!metaSent) {
                        send({ type: "error", message: `Process exited with code ${code}` });
                    }
                }
                send({ type: "done" });
                controller.close();
            });

            proc.on("error", (err) => {
                clearTimeout(watchdog);
                send({ type: "error", message: err.message });
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
};
