// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { Context } from "./Auth";

import { useContext } from "solid-js";

import { A } from "@solidjs/router";

export default () => {
    const context = useContext(Context);

    if (!context) throw new Error("Can't find auth's context");

    context.set_title("Sign up");

    const submit_signup = async (
        event: SubmitEvent & { currentTarget: HTMLFormElement },
    ) => {
        event.preventDefault();

        const data = new FormData(event.currentTarget);

        const res = await fetch("/api/internal/signup", {
            method: "post",
            body: JSON.stringify({
                name: data.get("name"),
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
                onSubmit={submit_signup}
                onInput={(event) => {
                    context.set_error(undefined);

                    let form = event.currentTarget;

                    let submit = document.getElementById("submit");

                    if (form.checkValidity()) {
                        submit?.classList.remove("btn-disabled");
                    } else submit?.classList.add("btn-disabled");
                }}
                onChange={(_) => {
                    let password = document.getElementById(
                        "password",
                    )! as HTMLInputElement;
                    let password_check = document.getElementById(
                        "password_check",
                    )! as HTMLInputElement;

                    // Check whether `password` and `password_check` fields match.
                    if (password.value !== password_check.value) {
                        password_check.setCustomValidity(
                            "Passwords do not match.",
                        );
                        password_check.reportValidity();
                    } else {
                        password_check.setCustomValidity("");
                    }
                }}
            >
                <fieldset class="fieldset">
                    <label>
                        <span class="label">Name</span>
                        <input
                            name="name"
                            type="text"
                            class="input validator"
                            placeholder="Name"
                            required
                        />
                    </label>

                    <label>
                        <span class="label">Email</span>
                        <input
                            name="email"
                            type="email"
                            class="input peer validator"
                            placeholder="Email"
                            required
                        />
                        <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:block">
                            Email is not valid.
                        </p>
                    </label>

                    <label>
                        <span class="label">Password</span>
                        <input
                            id="password"
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

                    <label>
                        <span class="label">Confirm password</span>
                        <input
                            id="password_check"
                            name="password_check"
                            type="password"
                            class="input peer validator"
                            placeholder="Retype your password"
                            required
                        />
                        <p class="text-error pt-1 hidden peer-not-placeholder-shown:peer-invalid:peer-focus:block">
                            Passwords do not match.
                        </p>
                    </label>

                    <input
                        id="submit"
                        type="submit"
                        class="btn btn-neutral btn-disabled mt-4 submit hover:shadow-xl"
                        value="Sign up"
                    />
                </fieldset>
            </form>

            <div class="text-center mt-2">
                <A class="text-sm w-max font-light" href="/">
                    Already have an account? Login.
                </A>
            </div>
        </>
    );
};
