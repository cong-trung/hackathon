import { useGetMeQuery } from '@/app/api/authApi';

export const roleLabels = { admin: 'Admin', ti: 'TI', me: 'ME', viewer: 'Viewer' };

export function useAuth() {
    const { data, isLoading, isFetching } = useGetMeQuery();
    const user = data?.user?.status === 'active' ? data.user : null;
    const role = user?.role;
    const permissions = user ? (data?.permissions ?? {}) : {};
    return {
        user,
        role,
        permissions,
        isLoading: isLoading || (isFetching && !data),
        isAuthenticated: Boolean(user),
        isAdmin: role === 'admin',
        isTI: role === 'ti',
        isME: role === 'me',
        isViewer: role === 'viewer',
        isGuest: role === 'viewer',
    };
}

export function loginPath(path) {
    return `/login?next=${encodeURIComponent(path)}`;
}

export function authErrorMessage(error) {
    const code = error?.data?.detail?.code ?? error?.detail?.code;
    const messages = {
        invalid_username: 'Use 3-32 lowercase letters, numbers, dots, underscores or hyphens.',
        invalid_display_name: 'Enter a valid display name without | or leading =, +, - or @.',
        invalid_email: 'Enter a valid email address.',
        username_taken: 'That username is already taken.',
        invalid_credentials: 'Incorrect username or password.',
        account_pending: 'Your account is awaiting admin approval.',
        account_disabled: 'This account has been disabled. Contact an admin.',
        too_many_attempts: 'Too many attempts. Try again later.',
        unauthenticated: 'Your session expired. Log in to edit.',
        admin_required: 'Only admins can perform this action.',
        user_not_found: 'That account could not be found.',
        last_admin: 'The last active admin cannot be disabled.',
        cannot_change_own_role: 'You cannot change your own role.',
        email_required_for_me: 'An email address is required before assigning the ME role.',
        user_not_active: 'Only active accounts can change roles.',
        me_cannot_change_status: 'ME users can save changes but cannot change submission status.',
        forbidden_fields: 'Some fields are not editable for your assigned modules.',
        me_cannot_create: 'ME users cannot create new submissions. Open an assigned submission to edit.',
        me_no_owned_modules: 'Your email is not listed as a PdO owner for this submission.',
        cannot_change_self: 'You cannot change your own account.',
        invalid_role: 'Select a valid role.',
        invalid_status: 'This account cannot be changed in its current status.',
    };
    return messages[code] ?? (error?.status === 401 ? messages.unauthenticated :
        error?.status === 403 ? messages.admin_required : 'Something went wrong. Please try again.');
}