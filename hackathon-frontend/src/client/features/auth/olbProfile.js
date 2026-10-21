import { z } from 'zod';

export const profileSchema = z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(100, 'Name must be 100 characters or fewer.')
        .refine((value) => !Array.from(value).some((character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
        'Name cannot contain control characters.'),
    wwid: z.string().trim().regex(/^\d{6,12}$/, 'Enter a 6 to 12 digit WWID.'),
    email: z.string().trim().max(254, 'Email must be 254 characters or fewer.')
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address.'),
});

export async function fetchOlbProfile() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
        const response = await fetch(
            import.meta.env.VITE_OLB_PROFILE_URL || 'https://olbplus.intel.com:3386/fetch_profile',
            {
                method: import.meta.env.VITE_OLB_PROFILE_METHOD || 'GET',
                credentials: 'include',
                mode: 'cors',
                signal: controller.signal,
            },
        );
        if (!response.ok) throw new Error('OLB+ profile unavailable');
        const data = await response.json();
        const profile = profileSchema.safeParse({
            email: data?.email ?? data?.mail,
            name: data?.username ?? data?.Name ?? data?.name,
            wwid: data?.wwid ?? data?.WWID,
        });
        if (!profile.success) throw new Error('Invalid OLB+ profile');
        return profile.data;
    } finally {
        clearTimeout(timeout);
    }
}