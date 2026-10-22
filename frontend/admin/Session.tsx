// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

export interface Session {
    user_id: number;
    name: string;
    email: string;
    role: string | null;
    /** Local admin: the server listens on loopback, so the panel needs no login. */
    local?: boolean;
    /** Whether the databases are connected (otherwise only the setup page is available). */
    connected: boolean;
    /** Last databases connection error, shown in the setup page. */
    setup_error?: string | null;
}

export interface SetupStatus {
    connected: boolean;
    error: string | null;
    local_admin: boolean;
}

export const setup_status = async (): Promise<SetupStatus> => {
    const res = await fetch("/_setup/status", { cache: "no-store" });
    return (await res.json()) as SetupStatus;
};

export const fetcher = async (): Promise<Session> => {
    const status = await setup_status();

    if (status.local_admin) {
        return {
            user_id: 0,
            name: "local admin",
            email: "",
            role: "admin",
            local: true,
            connected: status.connected,
            setup_error: status.error,
        };
    }

    const res = await fetch("/api/internal/whoami");

    if (!res.ok) console.clear();

    if (res.status === 200) {
        const data = await res.json();

        if ((data as Session).role !== "admin") {
            const res = await fetch("/api/internal/bootstrap");

            const maybe_new_role = (await res.json()) as {
                role: string | null;
            };

            data.role = maybe_new_role.role;
        }

        return { ...data, connected: status.connected } as Session;
    } else {
        const admin_base = location.pathname.startsWith("/admin2")
            ? "/admin2"
            : "/admin";
        document.location.replace(
            `${admin_base.replace("admin", "auth")}?redirect=${admin_base}`,
        );
        throw new Error("User is not logged in.");
    }
};

export const logout = async () => {
    await fetch("/api/internal/logout");
    document.location = "/";
};
