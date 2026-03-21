import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handleDelete } from './handlers/delete';

export async function DELETE({ url }: RequestEvent) {
	const pathParam = url.searchParams.get('path');
	if (!pathParam) throw error(400, 'Missing path');

	return await handleDelete(pathParam);
}
