// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";

import { type User } from "@admin/users";

import { confirm_btn } from "@admin/components/ConfirmButton";

import { createMemo, createSignal, Show, useContext } from "solid-js";

import {
    useNavigate,
    useParams,
    type RouteSectionProps,
} from "@solidjs/router";

export default (_: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [users, { refetch }] = app_cx.get_resource("users");

    if (!users) return <span></span>; // This component may be rendered twice, one of the renders will happen with users' context undefined.

    const navigate = useNavigate();

    const [error, set_error] = createSignal<string | undefined>(undefined);

    const id = useParams()["id"];

    const user = createMemo(() => {
        return id !== undefined && users() !== undefined
            ? users()!.filter((user) => {
                  return user.user_id == parseInt(id);
              })[0]!
            : undefined;
    });

    const submit_user = async () => {
        const form = document.getElementById("form")! as HTMLFormElement;

        const form_data = Object.fromEntries(new FormData(form));

        const req = {
            name: form_data["name"]?.toString(),
            email: form_data["email"]?.toString(),
            role: form_data["role"]?.toString(),
            password: form_data["password"]?.toString(),
        } as User;

        if (user()) {
            for (const field in req) {
                const value = req[field as keyof User];
                if (
                    field !== "role" &&
                    (value === undefined || value?.toString().length === 0)
                )
                    delete req[field as keyof User];
            }
        }

        const res = await fetch(`/api/internal/admin/users/${id ?? ""}`, {
            method: id ? "put" : "post",
            body: JSON.stringify(req),
        });

        if (!res.ok) {
            // console.clear();

            const data = (await res.json()) as {
                error: string;
            };

            set_error(`Cannot update user's data. ${data.error}`);

            return;
        }

        refetch();

        navigate("/users", {
            replace: false,
            scroll: false,
        });
    };

    const delete_user = async () => {
        const res = await fetch(
            `/api/internal/admin/users/${user()!.user_id}`,
            {
                method: "delete",
            },
        );

        if (!res.ok) console.clear();

        if (res.status === 200) {
            refetch();

            navigate("/users", {
                replace: false,
                scroll: false,
            });
        } else {
            const data = (await res.json()) as {
                error: string;
            };

            const delete_button = document.getElementById("delete_user")!;

            delete_button.innerText = "Retry";
            delete_button.setAttribute("data-confirmed", "false");

            set_error(data.error);
        }
    };

    return (
        <>
            <div class="grid gap-2 py-8">
                <div>
                    <h1 class="text-3xl text-center pt-4 font-bold">
                        {user() !== undefined ? user()!.name : "New user"}
                    </h1>
                </div>

                <Show when={error() != undefined}>
                    <div
                        class="bg-red-800 border-red-400 backdrop-blur shadow-xl rounded-box my-2 p-2 text-center cursor-pointer"
                        onClick={() => set_error(undefined)}
                    >
                        <p class="text-sm font-semibold">
                            An error has occurred. {error()!}
                        </p>
                    </div>
                </Show>
                <form
                    id="form"
                    class="[&_span]:mb-1"
                    onInput={(event) => {
                        set_error(undefined);

                        let form = event.currentTarget;
                        let submit = document.getElementById("submit");

                        if (form.checkValidity()) {
                            submit?.classList.remove("btn-disabled");
                        } else submit?.classList.add("btn-disabled");
                    }}
                >
                    <fieldset class="fieldset [&_.input]:w-full md:grid-cols-2 gap-3">
                        <label>
                            <span class="label">Name</span>
                            <input
                                name="name"
                                type="text"
                                class="input"
                                placeholder={user() ? user.name : "Name"}
                                value={user() ? user()!.name : ""}
                                required={user() === undefined}
                            />
                        </label>

                        <label>
                            <span class="label">Email</span>
                            <input
                                name="email"
                                type="text"
                                class="input peer validator"
                                placeholder={user() ? user()!.email : "Email"}
                                value={user() ? user()!.email : ""}
                                required={user() === undefined}
                            />
                            <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:block">
                                Email is not valid.
                            </p>
                        </label>

                        <label>
                            <span class="label">Role</span>
                            <input
                                name="role"
                                type="text"
                                class="input"
                                placeholder={
                                    user() ? (user()!.role ?? "Role") : "Role"
                                }
                                value={user() ? (user()!.role ?? "") : ""}
                            />
                        </label>

                        <label>
                            <span class="label">Password</span>
                            <input
                                name="password"
                                type="password"
                                class="input peer validator"
                                placeholder="Password"
                                value={user() ? user()!.password : ""}
                                minLength="8"
                                required={user === undefined}
                            />
                            <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:peer-focus:block">
                                Password must have 8 characters or more.
                            </p>
                        </label>
                    </fieldset>
                </form>
                <div class="flex gap-2 [&_button]:rounded-lg [&_button]:hover:shadow">
                    <button
                        id="delete_user"
                        class="btn btn-active hover:text-white hover:bg-red-600"
                        classList={{
                            hidden: user() === undefined,
                        }}
                        data-confirmed={false}
                        onClick={confirm_btn(delete_user)}
                    >
                        Delete user
                    </button>
                    <button
                        id="submit"
                        type="submit"
                        class="btn btn-active hover:text-black hover:btn-success"
                        classList={{
                            "btn-disabled": user() === undefined,
                        }}
                        data-confirmed={false}
                        onClick={confirm_btn(submit_user)}
                    >
                        {user() ? "Update" : "Create user"}
                    </button>
                </div>
            </div>
        </>
    );
};
