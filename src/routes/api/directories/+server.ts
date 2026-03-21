import { isHttpError, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handleNavigation } from './handlers/navigation';

export async function GET({ url }: RequestEvent) {
	const folderParam = url.searchParams.get('path');
	try {
		return await handleNavigation(folderParam);
	} catch (e: any) {
		console.error('API Directories Error:', e);
		if (isHttpError(e)) throw e;
		throw e;
	}
}
