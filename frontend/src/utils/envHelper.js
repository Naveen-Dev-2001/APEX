export const getEnvValue = (obj, targetKey) => {
    if (!obj) return undefined;
    const lowerTarget = targetKey.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerTarget);
    return foundKey ? obj[foundKey] : undefined;
};

export const getERPSystem = () => {
    const rawTool = getEnvValue(window._env_, 'VITE_TOOL') || 
                    getEnvValue(import.meta.env, 'VITE_TOOL') || 
                    '';
    const tool = rawTool.toString().trim().toLowerCase();
    if (tool === 'zoho') {
        return 'Zoho';
    }
    return 'Sage';
};
