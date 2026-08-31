export async function getPYPCSModules() {
    const res = await fetch('/api/pypcs/modules');

    if (!res.ok) {
        throw new Error(await res.text());
    }

    return res.json();
}

export async function getVisibleQuestions(selectedModules, role = 'TI') {
    const res = await fetch('/api/pypcs/visible-questions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            selected_modules: selectedModules,
            role,
        }),
    });

    if (!res.ok) {
        throw new Error(await res.text());
    }

    return res.json();
}

export async function submitPYPCSSubmission(payload) {
    const res = await fetch('/api/pypcs/submission', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(await res.text());
    }

    return res.json();
}
