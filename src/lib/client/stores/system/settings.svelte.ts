export function createSettingsStore() {
    let savePath = $state("");
    let cookiesConfig = $state<any>(null);

    return {
        get savePath() { return savePath; },
        set savePath(val: string) { savePath = val; },
        get cookiesConfig() { return cookiesConfig; },
        set cookiesConfig(val: any) { cookiesConfig = val; }
    };
}

export const settingsStore = createSettingsStore();
