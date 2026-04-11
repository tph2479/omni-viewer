import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { spawn } from "child_process";

export const GET: RequestHandler = async ({ url }) => {
    const targetUrl = url.searchParams.get("url");
    const mediaType = url.searchParams.get("type"); 
    const isPlaylist = url.searchParams.get("playlist") === "true";

    if (!targetUrl) {
        return json({ error: "Missing url parameter" }, { status: 400 });
    }

    const fetchYtdlp = () => new Promise((resolve) => {
        const args = [
            "--dump-json",
            "--no-download",
            "--ignore-config",
            "--no-warnings",
            "--playlist-end", "51",
            targetUrl!,
        ];

        if (isPlaylist) {
            args.push("--flat-playlist", "--yes-playlist");
        } else {
            args.push("--no-playlist");
        }

        const proc = spawn("yt-dlp", args);

        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => { proc.kill(); resolve(null); }, 60000);

        proc.stdout.on("data", (c) => stdout += c.toString());
        proc.stderr.on("data", (c) => stderr += c.toString());

        proc.on("close", (code) => {
            clearTimeout(timeout);
            if (!stdout) {
                console.error("yt-dlp failed or returned no output. stderr:", stderr);
                return resolve(null);
            }
            try {
                // Find all valid JSON objects in the output
                const cleanedStdout = stdout.replace(/^\uFEFF/, "");
                const lines = cleanedStdout.trim().split("\n");
                const objects: any[] = [];
                
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line.trim());
                        if (parsed && typeof parsed === 'object') {
                            objects.push(parsed);
                        }
                    } catch { continue; }
                }

                if (objects.length === 0) return resolve(null);

                // Prioritize the object with entries if we are in playlist mode
                let meta = objects[0];
                let virtualEntries: any[] = [];
                
                if (isPlaylist) {
                    const withEntries = objects.find(o => o.entries && Array.isArray(o.entries));
                    if (withEntries) {
                        meta = withEntries;
                    } else if (objects.length > 1) {
                        // Virtual playlist from sequential objects (YouTube Mix/Radio style)
                        meta = objects[0];
                        // Skip the first object in the entries list as it's used for the main header
                        virtualEntries = objects.slice(1).map(o => ({
                            title: o.title || "No Title",
                            thumbnail: o.thumbnail || (o.thumbnails?.[0]?.url) || null,
                            url: o.url || o.webpage_url || (o.id ? `https://www.youtube.com/watch?v=${o.id}` : null),
                            duration: o.duration || null,
                        })).filter(e => e.url);
                    }
                }

                if (!meta) return resolve(null);

                const result = {
                    title: (isPlaylist ? (meta.playlist_title || meta.playlist || meta.title) : meta.title) || "Unknown Title",
                    thumbnail: meta.thumbnail || (meta.thumbnails?.[0]?.url) || null,
                    uploader: meta.uploader || meta.channel || null,
                    duration: meta.duration || null,
                    extractor: meta.extractor_key || meta.extractor || null,
                    entries: virtualEntries
                };

                if (meta.entries && Array.isArray(meta.entries) && virtualEntries.length === 0) {
                    result.entries = meta.entries.map((e: any) => ({
                        title: e.title || "No Title",
                        thumbnail: e.thumbnail || (e.thumbnails?.[0]?.url) || null,
                        url: e.url || e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null),
                        duration: e.duration || null,
                    })).filter((e: any) => e.url);
                }

                resolve(result);
            } catch (err) {
                console.error("Error parsing yt-dlp output:", err);
                resolve(null);
            }
        });
    });

    const fetchGalleryDl = () => new Promise((resolve) => {
        const proc = spawn("gdl.exe", [
            "-j",
            targetUrl,
        ]);

        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => { proc.kill(); resolve(null); }, 20000);

        proc.stdout.on("data", (c) => stdout += c.toString());
        proc.stderr.on("data", (c) => stderr += c.toString());

        proc.on("close", (code) => {
            clearTimeout(timeout);
            if (!stdout) {
                console.error("gallery-dl failed or returned no output. stderr:", stderr);
                return resolve(null);
            }
            try {
                // Find all type 3 records (URL + metadata)
                const lines = stdout.trim().split("\n");
                const entries: any[] = [];
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        // gallery-dl -j outputs each item as a JSON list [type, url, metadata]
                        if (Array.isArray(item) && item[0] === 3) {
                            entries.push({
                                title: item[2]?.filename || "Image",
                                thumbnail: item[1],
                                url: item[1],
                            });
                        }
                    } catch { continue; }
                }

                if (entries.length === 0) return resolve(null);

                resolve({
                    title: entries[0].title || "Gallery",
                    thumbnail: entries[0].thumbnail,
                    extractor: "gallery-dl",
                    entries: isPlaylist && entries.length > 1 ? entries : []
                });
            } catch (err) {
                console.error("Error parsing gallery-dl output:", err);
                resolve(null);
            }
        });
    });

    // Try yt-dlp first for most things, then gdl for images
    let meta: any = await fetchYtdlp();
    if (!meta && mediaType === "image") {
        meta = await fetchGalleryDl();
    } else if (!meta) {
        // Even if type isn't image, try gdl as fallback
        meta = await fetchGalleryDl();
    }

    if (meta) {
        return json(meta);
    }

    return json({ 
        error: "Could not fetch metadata. The URL might be unsupported or restricted.",
        details: "Ensure the URL is valid and publicly accessible."
    }, { status: 422 });
};
