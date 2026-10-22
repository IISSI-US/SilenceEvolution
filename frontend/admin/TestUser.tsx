// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { createSignal } from "solid-js";

/**
 * User of the app that the panel's tests run as: its session token is sent as the
 * `Authorization` header of every test request. Shared by the Authentication page, the header
 * and the tests, and kept in localStorage so it survives reloads.
 */
export interface TestUser {
    token: string;
    user_id: number | null;
    name: string;
    email: string;
    role: string | null;
}

const STORAGE_KEY = "test_user";

const read_stored = (): TestUser | undefined => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? (JSON.parse(stored) as TestUser) : undefined;
    } catch {
        return undefined;
    }
};

const [test_user, set_test_user_signal] = createSignal<TestUser | undefined>(
    read_stored(),
);

export { test_user };

/** The token sent by test requests, if a user is authenticated. */
export const test_token = () => test_user()?.token;

const set_test_user = (user: TestUser | undefined) => {
    try {
        if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {}

    set_test_user_signal(user);
};

/**
 * Uses `token` for the tests and looks up who it belongs to. The panel's own session is never
 * touched: requests omit cookies and carry the token in the header.
 */
export const adopt_token = async (token: string) => {
    const res = await fetch("/api/internal/whoami", {
        headers: { Authorization: token, "Cache-Control": "no-cache" },
        credentials: "omit",
    });

    if (res.ok) {
        const me = (await res.json()) as Omit<TestUser, "token">;
        set_test_user({ ...me, token });
    } else {
        set_test_user({
            token,
            user_id: null,
            name: "unknown user",
            email: "",
            role: null,
        });
    }
};

/**
 * Opens a session for a user of the app from the admin API (no password needed) and makes it the
 * test user. Throws with the server's message.
 */
export const authenticate_test_user = async (user_id: number) => {
    const res = await fetch(`/api/internal/admin/users/${user_id}/session`, {
        method: "POST",
        headers: { "Cache-Control": "no-cache" },
    });

    const body = (await res.json().catch(() => ({}))) as Partial<TestUser> & {
        error?: string;
    };

    if (!res.ok || !body.token) {
        throw new Error(body.error ?? "Cannot authenticate the user.");
    }

    set_test_user(body as TestUser);
};

/** Ends the test user's session (GET /api/internal/logout) and forgets it. */
export const logout_test_user = async () => {
    const token = test_token();

    if (token) {
        await fetch("/api/internal/logout", {
            headers: { Authorization: token, "Cache-Control": "no-cache" },
            credentials: "omit",
        }).catch(() => {});
    }

    set_test_user(undefined);
};

/** Forgets the test user without calling the server (e.g. its session expired). */
export const forget_test_user = () => set_test_user(undefined);
