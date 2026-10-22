// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";

import { type User } from "@admin/users";

import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import Modal from "@admin/components/Modal";
import SearchButton from "@admin/components/SearchButton";
import { SortableColumnCell } from "@admin/components/List";

import {
    children,
    createEffect,
    createSignal,
    Index,
    on,
    Show,
    useContext,
} from "solid-js";

import { Portal } from "solid-js/web";

import { A, useNavigate, type RouteSectionProps } from "@solidjs/router";

import { filter, pipe, sortBy } from "remeda";

export default (props: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [users, { refetch }] = app_cx.get_resource("users");

    const navigate = useNavigate();

    const [get_alert, set_alert] = createSignal<AlertStruct | undefined>(
        undefined,
    );

    let table_container: HTMLDivElement | undefined = undefined;

    // Table sort state.
    const [get_table_sort, set_table_sort] = createSignal<{
        field: keyof any;
        order: "asc" | "desc";
    }>({ field: "name", order: "asc" });

    // Search field.
    const [get_search, set_search] = createSignal<string | undefined>(
        undefined,
    );

    // Rendered list.
    const [users_list, set_users_list] = createSignal<Array<User>>(new Array());

    const resolved_children = children(() => props.children);

    createEffect(
        on(resolved_children, (resolved_children) => {
            if (resolved_children !== undefined) {
                document.body.style.overflow = "hidden";
            } else {
                document.body.style.overflow = "";
            }
        }),
    );

    createEffect(() => {
        if (users() !== undefined)
            set_users_list(
                pipe(
                    users() ?? new Array(),
                    sortBy([
                        (user) => user[get_table_sort().field as keyof User]!,
                        get_table_sort().order,
                    ]),
                    filter((user) => {
                        if (get_search() !== undefined) {
                            const search_term = get_search()!.toLowerCase();

                            return (
                                user.name.toLowerCase().includes(search_term) ||
                                user.email.toLowerCase().includes(search_term)
                            );
                        } else return true;
                    }),
                ),
            );
    });

    createEffect(() =>
        set_alert({
            value: "Help: list of users shared with all Silence's projects, select a user to modify or delete it.",
        }),
    );

    return (
        <>
            <div>
                <div class="flex flex-col gap-3 pb-3 items-center w-full">
                    <div class="flex not-lg:flex-col not-lg:gap-3 items-center w-full">
                        <h1 class="text-4xl font-bold">Users</h1>
                        <div class="flex gap-2 self-end text-right ml-auto items-center">
                            <SearchButton
                                search={[get_search, set_search]}
                            ></SearchButton>
                            <button
                                class="btn text-sm self-end text-right ml-auto"
                                onClick={refetch}
                            >
                                <span class="material-symbols-outlined">
                                    refresh
                                </span>
                            </button>
                            <A
                                class="btn text-sm self-end text-right ml-auto"
                                href="/users/new"
                            >
                                <span class="material-symbols-outlined lg:hidden!">
                                    add
                                </span>
                                <span class="not-lg:hidden">
                                    Create new user
                                </span>
                            </A>
                        </div>
                    </div>

                    <AlertBox
                        alert_signals={[get_alert, set_alert]}
                        hide_timeout={!get_alert()?.is_error ? 5000 : undefined}
                    ></AlertBox>
                </div>

                <Show
                    when={!users.loading}
                    fallback={
                        <div class="flex w-full my-8 justify-center">
                            <span class="loading loading-spinner loading-xl"></span>
                        </div>
                    }
                >
                    <Modal parent_path="/users">{props.children}</Modal>

                    <div
                        class="overflow-x-auto transition-all transition-discrete duration-500 starting:opacity-0 starting:scale-95"
                        ref={table_container}
                    >
                        <div class="table text-sm table-auto border-collapse">
                            <div class="table-header-group border-b-2 border-b-base-300">
                                <div class="table-row font-bold bg-base-300 [&>div]:w-auto [&>div]:p-3 [&_div]:align-middle [&>div]:text-left [&>div]:rounded-none">
                                    <SortableColumnCell
                                        title="ID"
                                        field="user_id"
                                        classList={{
                                            "rounded-tl-xl! pl-8!": true,
                                        }}
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <SortableColumnCell
                                        title="Name"
                                        field="name"
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <SortableColumnCell
                                        title="Email"
                                        field="email"
                                        table_sort={[
                                            get_table_sort,
                                            set_table_sort,
                                        ]}
                                    />
                                    <div class="table-cell">Role</div>
                                    <div class="table-cell rounded-tr-xl!">
                                        Password
                                    </div>
                                </div>
                            </div>
                            <div class="table-row-group [&>div]:even:bg-base-200 [&>div]:hover:bg-base-300 [&>div]:transition [&>div]:duration-200 [&>div]:hover:scale-101 [&>div]:hover:cursor-pointer">
                                <Index
                                    each={users_list()}
                                    fallback={
                                        <Portal mount={table_container!}>
                                            <div class="flex my-8 justify-center items-center text-center">
                                                <p class="text-sm font-light">
                                                    No users found with the
                                                    matching criteria.
                                                </p>
                                            </div>
                                        </Portal>
                                    }
                                >
                                    {(user, _) => (
                                        <div
                                            class="table-row border-b border-b-base-300 [&_span]:text-xs [&_span]:lg:text-sm [&_div]:size-auto [&_div]:p-2 [&_div]:align-middle"
                                            onClick={() =>
                                                navigate(
                                                    `/users/${user().user_id}`,
                                                    {
                                                        replace: false,
                                                        scroll: false,
                                                    },
                                                )
                                            }
                                        >
                                            <div class="table-cell font-light pl-8!">
                                                {user().user_id}
                                            </div>
                                            <div class="table-cell font-bold">
                                                {user().name}
                                            </div>
                                            <div class="table-cell">
                                                {user().email}
                                            </div>
                                            <div class="table-cell">
                                                {user().role ?? "—"}
                                            </div>
                                            <div class="table-cell [&_span]:hidden after:content-['********'] after:text-base-content hover:[&_span]:block hover:after:hidden pr-4!">
                                                <span>{user().password}</span>
                                            </div>
                                        </div>
                                    )}
                                </Index>
                            </div>
                        </div>
                    </div>
                </Show>
            </div>
        </>
    );
};
