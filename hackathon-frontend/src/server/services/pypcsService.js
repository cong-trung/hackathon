import { config } from '../config/env.js';
import { identityHeaders } from '../utils/identityHeaders.js';

const BACKEND_BASE_URL = config.djangoBaseUrl || 'http://127.0.0.1:8000';

async function proxyRequest(req, res, url, options = {}) {
    try {
        console.log('[PYPCS proxy] forwarding to:', url);

        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                ...identityHeaders(req.user),
            },
        });
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

        return res.status(500).json({
            message: 'Failed to proxy PYPCS request',
            url,
            error: error.message,
            cause: error.cause
                ? {
                      code: error.cause.code,
                      address: error.cause.address,
                      port: error.cause.port,
                      syscall: error.cause.syscall,
                  }
                : null,
        });
    }
}

async function proxyRawRequest(req, res, url, options = {}) {
    try {
        console.log('[PYPCS proxy] forwarding raw response to:', url);

        const response = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                ...identityHeaders(req.user),
            },
        });
        const body = Buffer.from(await response.arrayBuffer());
        res.status(response.status);

        for (const header of ['content-type', 'content-disposition']) {
            const value = response.headers.get(header);
            if (value) {
                res.setHeader(header, value);
            }
        }

        return res.send(body);
    } catch (error) {
        console.error('[PYPCS proxy] raw fetch failed:', {
            url,
            message: error.message,
            cause: error.cause,
        });

        return res.status(500).json({
            message: 'Failed to proxy PYPCS request',
            url,
            error: error.message,
            cause: error.cause
                ? {
                      code: error.cause.code,
                      address: error.cause.address,
                      port: error.cause.port,
                      syscall: error.cause.syscall,
                  }
                : null,
        });
    }
}

export async function getPypcsModules(req, res) {
    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/modules`);
}

export async function getPypcsQuestions(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';

    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/questions${suffix}`);
}

export async function updatePypcsQuestionDescription(req, res) {
    const { questionId } = req.params;

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/questions/${questionId}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
        },
    );
}

export async function getPypcsVisibleQuestions(req, res) {
    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/visible-questions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsSubmissions(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions${suffix}`,
    );
}

export async function getPypcsSubmissionDetail(req, res) {
    const { submissionId } = req.params;

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}`,
    );
}

export async function getPypcsSubmissionHistory(req, res) {
    const { submissionId } = req.params;

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}/history`,
    );
}

export async function verifyPypcsEditPin(req, res) {
    const { submissionId } = req.params;

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}/verify-edit-pin`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
        },
    );
}

export async function deletePypcsSubmission(req, res) {
    const { submissionId } = req.params;
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';
    const headers = {};
    const editPin = req.get('x-edit-pin');
    if (editPin) headers['X-Edit-Pin'] = editPin;

    return proxyRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}${suffix}`,
        { method: 'DELETE', headers },
    );
}

export async function submitPypcsMatrixSubmission(req, res) {
    const headers = { 'Content-Type': 'application/json' };
    const editPin = req.get('x-edit-pin');
    if (editPin) headers['X-Edit-Pin'] = editPin;

    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/matrix-submission`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsActionItems(req, res) {
    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/action-items`);
}

export async function getPypcsActionItemOptions(req, res) {
    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/action-items/options`);
}

export async function createPypcsActionItem(req, res) {
    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/action-items`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
    });
}

export async function updatePypcsActionItem(req, res) {
    const nbr = encodeURIComponent(String(req.params.nbr));

    return proxyRequest(req, res, `${BACKEND_BASE_URL}/pypcs/action-items/${nbr}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
    });
}

export async function getPypcsProductActionMatrix(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';

    return proxyRawRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix${suffix}`,
    );
}

export async function updatePypcsProductActionMatrixRow(req, res) {
    return proxyRawRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix/rows`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
        },
    );
}

export async function exportPypcsProductActionMatrix(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';

    return proxyRawRequest(
        req,
        res,
        `${BACKEND_BASE_URL}/pypcs/product-action-matrix/export${suffix}`,
    );
}