import { useGetMeQuery } from '@/app/api/authApi';

export function useAuth() {
    const { data, isLoading, isFetching } = useGetMeQuery();
    const user = data?.user?.status === 'active' ? data.user : null;
    return {
        user,
        isLoading: isLoading || (isFetching && !data),
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === 'admin',
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
        cannot_change_self: 'You cannot change your own account.',
        invalid_role: 'Select a valid role.',
        invalid_status: 'This account cannot be changed in its current status.',
    };
    return messages[code] ?? (error?.status === 401 ? messages.unauthenticated :
        error?.status === 403 ? messages.admin_required : 'Something went wrong. Please try again.');
}