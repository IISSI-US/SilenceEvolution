// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

export interface Session {
    user_id: number;
    name: string;
    email: string;
    role: string | null;
}

export const fetcher = async (): Promise<Session> => {
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

        return data as Session;
    } else {
        const admin_base = location.pathname.startsWith("/admin2") ? "/admin2" : "/admin";
        document.location.replace(`${admin_base.replace("admin", "auth")}?redirect=${admin_base}`);
        throw new Error("User is not logged in.");
    }
};

export const logout = async () => {
    await fetch("/api/internal/logout");
    document.location = "/";
};
