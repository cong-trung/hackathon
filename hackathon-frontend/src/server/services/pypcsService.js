import { config } from '../config/env.js';
import { getAuthorizationHeader } from '../utils/forwardRequest.js';

const BACKEND_BASE_URL = config.djangoBaseUrl || 'http://127.0.0.1:8000';

async function proxyRequest(res, url, options = {}) {
    try {
        console.log('[PYPCS proxy] forwarding to:', url);
        const response = await fetch(url, options);
        if (response.status >= 500) {
            console.error('[PYPCS proxy] backend returned an error:', {
                url,
                status: response.status,
            });
            return res
                .status(502)
                .json({ code: 'proxy_error', message: 'Backend unavailable' });
        }
        const text = await response.text();
        res.status(response.status);
        try {
            return res.json(JSON.parse(text));
        } catch {
            return res.send(text);
        }
    } catch (error) {
        console.error('[PYPCS proxy] fetch failed:', {
            url,
            message: error.message,
            cause: error.cause,
        });
        return res
            .status(502)
            .json({ code: 'proxy_error', message: 'Backend unavailable' });
    }
}

async function proxyRawRequest(res, url, options = {}) {
    try {
        console.log('[PYPCS proxy] forwarding raw response to:', url);
        const response = await fetch(url, options);
        if (response.status >= 500) {
            console.error('[PYPCS proxy] backend returned an error:', {
                url,
                status: response.status,
            });
            return res
                .status(502)
                .json({ code: 'proxy_error', message: 'Backend unavailable' });
        }
        const body = Buffer.from(await response.arrayBuffer());
        res.status(response.status);
        for (const header of ['content-type', 'content-disposition']) {
            const value = response.headers.get(header);
            if (value) res.setHeader(header, value);
        }
        return res.send(body);
    } catch (error) {
        console.error('[PYPCS proxy] raw fetch failed:', {
            url,
            message: error.message,
            cause: error.cause,
        });
        return res
            .status(502)
            .json({ code: 'proxy_error', message: 'Backend unavailable' });
    }
}

function requestHeaders(req, headers = {}) {
    const authorization = getAuthorizationHeader(req);
    return {
        ...headers,
        ...(authorization ? { Authorization: authorization } : {}),
    };
}

export async function getPypcsModules(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/modules`);
}

export async function getPypcsQuestions(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/questions${suffix}`);
}

export async function updatePypcsQuestionDescription(req, res) {
    const questionId = encodeURIComponent(String(req.params.questionId));
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/questions/${questionId}`, {
        method: 'PATCH',
        headers: requestHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsVisibleQuestions(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/visible-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsSubmissions(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/submissions${suffix}`);
}

export async function getPypcsSubmissionDetail(req, res) {
    const submissionId = encodeURIComponent(String(req.params.submissionId));
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}`);
}

export async function getPypcsSubmissionHistory(req, res) {
    const submissionId = encodeURIComponent(String(req.params.submissionId));
    return proxyRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}/history`,
    );
}

export async function deletePypcsSubmission(req, res) {
    const submissionId = encodeURIComponent(String(req.params.submissionId));
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return proxyRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}${suffix}`,
        { method: 'DELETE', headers: requestHeaders(req) },
    );
}

export async function submitPypcsMatrixSubmission(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/matrix-submission`, {
        method: 'POST',
        headers: requestHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsActionItems(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/action-items`);
}

export async function getPypcsActionItemOptions(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/action-items/options`);
}

export async function createPypcsActionItem(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/action-items`, {
        method: 'POST',
        headers: requestHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(req.body),
    });
}

export async function updatePypcsActionItem(req, res) {
    const nbr = encodeURIComponent(String(req.params.nbr));
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/action-items/${nbr}`, {
        method: 'PUT',
        headers: requestHeaders(req, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsProductActionMatrix(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return proxyRawRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix${suffix}`,
    );
}

export async function updatePypcsProductActionMatrixRow(req, res) {
    return proxyRawRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix/rows`,
        {
            method: 'PUT',
            headers: requestHeaders(req, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(req.body),
        },
    );
}

export async function exportPypcsProductActionMatrix(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    return proxyRawRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix/export${suffix}`,
    );
}