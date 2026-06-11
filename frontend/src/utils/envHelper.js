export const getERPSystem = () => {
    const host = window.location.host;
    if (host.includes('3004') || host.includes('zoho')) {
        return 'Zoho';
    }
    return 'Sage';
};
