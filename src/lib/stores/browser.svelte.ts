import type { ImageFile } from "$lib/utils/utils";

export function createBrowserStore() {
    let folderPath = $state("");
    let isFolderSelected = $state(false);
    let isLoading = $state(false);
    let errorMsg = $state("");
    let loadedImages = $state<ImageFile[]>([]);
    
    // Add other properties that need to be globally accessed 
    // We will extract more state from browser/+page.svelte later

    return {
        get folderPath() { return folderPath; },
        set folderPath(val: string) { folderPath = val; },
        get isFolderSelected() { return isFolderSelected; },
        set isFolderSelected(val: boolean) { isFolderSelected = val; },
        get isLoading() { return isLoading; },
        set isLoading(val: boolean) { isLoading = val; },
        get errorMsg() { return errorMsg; },
        set errorMsg(val: string) { errorMsg = val; },
        get loadedImages() { return loadedImages; },
        set loadedImages(val: ImageFile[]) { loadedImages = val; },
    };
}

export const browserStore = createBrowserStore();
