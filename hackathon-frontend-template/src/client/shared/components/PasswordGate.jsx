import { useState } from 'react';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/shared/components/ui/card';
import { useVerifyPasswordMutation } from '@/app/api/authApi';

function PasswordGate({ children }) {
    const [unlocked, setUnlocked] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState(false);
    const [verifyPassword, { isLoading }] = useVerifyPasswordMutation();

    async function handleSubmit(e) {
        e.preventDefault();
        const result = await verifyPassword(value);
        if (result.data?.success) {
            setUnlocked(true);
        } else {
            setError(true);
            setValue('');
        }
    }

    if (unlocked) return children;

    return (
        <div className="flex items-center justify-center h-full w-full">
            <Card className="w-full max-w-sm shadow-md">
                <CardHeader>
                    <CardTitle>Protected</CardTitle>
                    <CardDescription>
                        Enter the password to continue.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="gate-password">Password</Label>
                            <Input
                                id="gate-password"
                                type="password"
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    setError(false);
                                }}
                                placeholder="Enter password"
                                autoFocus
                            />
                            {error && (
                                <p className="text-xs text-red-500">
                                    Incorrect password. Please try again.
                                </p>
                            )}
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Unlocking...' : 'Unlock'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

export default PasswordGate;
