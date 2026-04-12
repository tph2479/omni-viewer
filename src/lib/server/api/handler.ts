import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { validatePath, type PathContext } from '$lib/server/api/pathUtils';

export interface ApiRequestOptions {
    /** 
     * 'required': Throws 400 if path is missing. 
     * 'optional': Resolves context if path exists, otherwise leaves empty.
     * 'none': Bypasses path resolution.
     */
    path?: 'required' | 'optional' | 'none';
    pathType?: 'file' | 'dir' | 'any';
    parsePagination?: boolean;
}

/**
 * Enhanced context for API handlers with flattened, semantic properties.
 */
export interface ApiHandlerContext extends RequestEvent {
    // Semantic Path Context (Flattened)
    absolutePath: string;
    internalPath: string | null;
    isArchivePath: boolean;
    normalizedPath: string;
    
    // Semantic Pagination (Flattened)
    page: number;
    limit: number;

    // Full objects preserved for edge cases
    pathContext?: PathContext;
}

/**
 * Standard API wrapper to reduce boilerplate.
 * Handles path validation, pagination parsing, and consistent error reporting.
 */
export function createApiHandler(
    logic: (ctx: ApiHandlerContext) => Promise<any>,
    options: ApiRequestOptions = {}
) {
    return async (event: RequestEvent) => {
        try {
            // Initialize basic context
            const ctx: ApiHandlerContext = { 
                ...event,
                absolutePath: '',
                internalPath: null,
                isArchivePath: false,
                normalizedPath: '',
                page: 0,
                limit: 50
            };

            const pathMode = options.path || 'none';

            // 1. Path resolution
            if (pathMode !== 'none') {
                const rawParam = event.url.searchParams.get('path') || event.url.searchParams.get('folder');
                
                if (pathMode === 'required' && !rawParam) {
                    throw error(400, 'Path is required');
                }

                if (rawParam) {
                    const pathContext = await validatePath(rawParam, options.pathType || 'any');
                    ctx.pathContext = pathContext;
                    ctx.absolutePath = pathContext.absolutePath;
                    ctx.internalPath = pathContext.internalPath;
                    ctx.isArchivePath = pathContext.isArchivePath;
                    ctx.normalizedPath = pathContext.normalizedPath;
                }
            }

            // 2. Pagination parsing if required
            if (options.parsePagination) {
                ctx.page = parseInt(event.url.searchParams.get('page') ?? '0', 10);
                ctx.limit = parseInt(event.url.searchParams.get('limit') ?? '50', 10);
            }

            // 3. Execute logic
            const result = await logic(ctx);

            // 4. Wrap in json() if it's not already a Response
            if (result instanceof Response) return result;
            return json(result);

        } catch (err: any) {
            // Already a SvelteKit error
            if (err?.status && err?.body) throw err;

            console.error('[API Error]', err);
            throw error(err.status || 500, {
                message: err.message || 'Internal Server Error',
                code: err.code || 'UNKNOWN_ERROR'
            });
        }
    };
}
