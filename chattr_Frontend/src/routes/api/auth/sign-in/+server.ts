import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const { username, password } = await request.json();

    try {
        const response = await fetch('http://localhost:5147/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            return json({ message: 'Username or password invalid' }, { status: 401 });
        }

        const result = await response.json();
        const token = result.token;

        cookies.set('session_token', token, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30 // 1 Month
        });

        return json({ success: true });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
        return json({ message: 'Unable to reach the Server: '}, { status: 500 });
    }
};