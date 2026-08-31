import { config } from '../config/env.js';

const BACKEND_BASE_URL = config.djangoBaseUrl || 'http://127.0.0.1:8000';

async function proxyRequest(res, url, options = {}) {
    try {
        console.log('[PYPCS proxy] forwarding to:', url);

        const response = await fetch(url, options);
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

export async function getPypcsModules(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/modules`);
}

export async function getPypcsQuestions(req, res) {
    const queryString = new URLSearchParams(req.query).toString();
    const suffix = queryString ? `?${queryString}` : '';

    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/questions${suffix}`);
}

export async function getPypcsVisibleQuestions(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/visible-questions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
    });
}

export async function submitPypcsSubmission(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/submission`, {
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
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions${suffix}`,
    );
}

export async function getPypcsSubmissionDetail(req, res) {
    const { submissionId } = req.params;

    return proxyRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}`,
    );
}

export async function deletePypcsSubmission(req, res) {
    const { submissionId } = req.params;

    return proxyRequest(
        res,
        `${BACKEND_BASE_URL}/pypcs/submissions/${submissionId}`,
        { method: 'DELETE' },
    );
}

export async function submitPypcsMatrixSubmission(req, res) {
    return proxyRequest(res, `${BACKEND_BASE_URL}/pypcs/matrix-submission`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
    });
}