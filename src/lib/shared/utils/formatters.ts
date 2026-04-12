/**
 * Chuyển đổi số bytes sang định dạng dễ đọc (KB/MB/GB).
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (!+bytes) return '0 Bytes';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Định dạng milliseconds sang chuỗi ngày tháng bản địa.
 */
export function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString();
}

/**
 * Định dạng milliseconds sang chuỗi ngày và giờ bản địa.
 */
export function formatDateTime(ms: number): string {
	return new Date(ms).toLocaleString();
}
