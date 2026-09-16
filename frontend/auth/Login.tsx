// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { Context } from "./Auth";

import { useContext } from "solid-js";

import { A } from "@solidjs/router";

export default () => {
    const context = useContext(Context);

    if (!context) throw new Error("Can't find auth's context");

    context.set_title("Login");

    const submit_login = async (
        event: SubmitEvent & { currentTarget: HTMLFormElement },
    ) => {
        event.preventDefault();

        const data = new FormData(event.currentTarget);

        const res = await fetch("/api/internal/login", {
            method: "post",
            body: JSON.stringify({
                email: data.get("email"),
                password: data.get("password"),
            }),
        });

        if (res.status == 200) document.location.replace(context.redirect);
        else context.set_error((await res.json())["error"]);
    };

    return (
        <>
            <form
                class="[&_span]:mb-1"
                onSubmit={submit_login}
                onInput={(event) => {
                    context.set_error(undefined);

                    let form = event.currentTarget;
                    let submit = document.getElementById("submit");

                    if (form.checkValidity()) {
                        submit?.classList.remove("btn-disabled");
                    } else submit?.classList.add("btn-disabled");
                }}
            >
                <fieldset class="fieldset">
                    <label>
                        <span class="label">Email</span>
                        <input
                            name="email"
                            type="email"
                            class="input peer validator"
                            placeholder="Email"
                            required
                        />
                        <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:peer-focus:block">
                            Email is not valid.
                        </p>
                    </label>

                    <label>
                        <span class="label">Password</span>
                        <input
                            name="password"
                            type="password"
                            class="input peer validator"
                            placeholder="Password"
                            minLength="4"
                            required
                        />
                        <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:peer-focus:block">
                            Password must have 4 characters or more.
                        </p>
                    </label>

                    <input
                        id="submit"
                        type="submit"
                        class="btn btn-neutral btn-disabled mt-4 hover:shadow-xl"
                        value="Login"
                    />
                </fieldset>
            </form>

            <div class="text-center mt-2">
                <A class="text-sm w-max font-light" href="signup">
                    No account? Signup.
                </A>
            </div>
        </>
    );
};
