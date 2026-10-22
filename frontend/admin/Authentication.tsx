// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { createSignal, Show } from "solid-js";

import { A } from "@solidjs/router";

import { login_test_user, logout_test_user, test_user } from "@admin/TestUser";

/**
 * Authentication page: signs in as a user of the app. Tests that require authentication run as
 * this user (its token is sent as the `Authorization` header), and the header shows who it is.
 */
export default () => {
    const [error, set_error] = createSignal<string | undefined>(undefined);
    const [busy, set_busy] = createSignal(false);

    const submit = async (event: SubmitEvent) => {
        event.preventDefault();

        // `currentTarget` is only the form during dispatch: keep it for after the request.
        const form_element = event.currentTarget as HTMLFormElement;
        const form = new FormData(form_element);

        set_busy(true);
        set_error(undefined);

        let signed_in = false;

        try {
            await login_test_user(
                String(form.get("email") ?? "").trim(),
                String(form.get("password") ?? ""),
            );
            signed_in = true;
        } catch (err) {
            set_error((err as Error).message);
        } finally {
            set_busy(false);
        }

        if (signed_in) form_element.reset();
    };

    return (
        <div class="flex flex-col gap-4 max-w-3xl">
            <div>
                <h1 class="text-4xl font-bold">Authentication</h1>
                <p class="text-sm text-base-content/60 mt-2">
                    Sign in as a user of your app. Tests of endpoints that
                    require authentication run as this user. Users are created
                    in the{" "}
                    <A href="/users" class="link">
                        Users
                    </A>{" "}
                    section.
                </p>
            </div>

            <Show
                when={test_user()}
                fallback={
                    <p class="text-sm">
                        Tests currently run{" "}
                        <span class="font-bold">anonymously</span>.
                    </p>
                }
            >
                <div class="bg-base-100 border border-base-300 rounded-box p-4 flex flex-col gap-2">
                    <div class="text-sm">
                        Tests run as{" "}
                        <span class="font-bold">{test_user()!.name}</span>
                        <Show when={test_user()!.email}>
                            {" "}
                            ({test_user()!.email})
                        </Show>
                        , role{" "}
                        <span class="font-bold">
                            {test_user()!.role ?? "none"}
                        </span>
                        .
                    </div>
                    <div class="text-xs font-mono break-all text-base-content/60">
                        Authorization: {test_user()!.token}
                    </div>
                    <div>
                        <button
                            class="btn btn-sm"
                            onClick={() => logout_test_user()}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </Show>

            <Show when={error()}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm">
                    {error()}
                </div>
            </Show>

            <form
                class="fieldset bg-base-100 border border-base-300 rounded-box p-4 grid grid-cols-1 lg:grid-cols-3 gap-3 items-end"
                onSubmit={submit}
            >
                <label>
                    <span class="label">Email</span>
                    <input
                        name="email"
                        type="email"
                        class="input"
                        required
                        autocomplete="off"
                    />
                </label>
                <label>
                    <span class="label">Password</span>
                    <input
                        name="password"
                        type="password"
                        class="input"
                        required
                        autocomplete="off"
                    />
                </label>
                <div>
                    <button
                        type="submit"
                        class="btn btn-primary"
                        disabled={busy()}
                    >
                        {test_user() ? "Switch user" : "Sign in"}
                    </button>
                </div>
            </form>
        </div>
    );
};
