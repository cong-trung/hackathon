import { config } from '../config/env.js';

export function identityHeaders(user) {
    if (!user) return {};

    return {
        'X-User-WWID': user.wwid,
        'X-User-Name': encodeURIComponent(user.name),
        'X-User-Email': user.email,
        'X-User-Source': user.source,
        'X-Proxy-Secret': config.proxySharedSecret,
    };
}