// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import AppCx from "@admin/AppCx";
import { type TestByFile } from "@admin/tests";

import AlertBox, { type AlertStruct } from "@admin/components/AlertContainer";
import SubPage from "@admin/components/SubPage";
import Dialog from "@admin/components/Dialog";
import CompositeTests from "@admin/tests/Composite";
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

import {
    A,
    useLocation,
    useNavigate,
    type RouteSectionProps,
} from "@solidjs/router";

import { filter, pipe, sortBy } from "remeda";
import Icon from "@admin/components/Icon";

export default (props: RouteSectionProps) => {
    const app_cx = useContext(AppCx)!;

    const [tests, { refetch }] = app_cx.get_resource("tests");

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
    const [tests_list, set_tests_list] = createSignal<Array<TestByFile>>(
        new Array(),
    );

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
        if (tests() !== undefined)
            set_tests_list(
                pipe(
                    tests()!,
                    sortBy([
                        (test_by_file) =>
                            test_by_file.test[
                                get_table_sort().field as keyof TestByFile
                            ]!,
                        get_table_sort().order,
                    ]),
                    filter((test_by_file) => {
                        if (get_search() !== undefined) {
                            const search_term = get_search()!.toLowerCase();

                            return (
                                test_by_file.test
                                    .name!.toLowerCase()
                                    .includes(search_term) ||
                                test_by_file.test
                                    .description!.toLowerCase()
                                    .includes(search_term)
                            );
                        } else return true;
                    }),
                ),
            );
    });

    createEffect(() =>
        set_alert({
            value: "Help: unit tests call one endpoint, select one to modify it or press Test to run it; composite tests run several unit tests in order.",
        }),
    );

    // Unit tests or composite tests.
    const [tab, set_tab] = createSignal<"unit" | "composite">("unit");

    // A sub-route is shown as a full page that replaces the list (editing a test) or as a modal
    // over it (running a test).
    const sub_page = children(() => props.children);

    const location = useLocation();
    const is_run = () => location.pathname.endsWith("/run");

    return (
        <>
            <Show when={sub_page() !== undefined && !is_run()}>
                <SubPage parent_path="/tests" parent_title="Tests">
                    {sub_page()}
                </SubPage>
            </Show>
            <Show when={sub_page() !== undefined && is_run()}>
                <Dialog parent_path="/tests">{sub_page()}</Dialog>
            </Show>
            <div classList={{ hidden: sub_page() !== undefined && !is_run() }}>
                <div class="flex flex-col gap-3 pb-3 items-center w-full">
                    <div class="flex not-lg:flex-col not-lg:gap-3 items-center w-full">
                        <h1 class="text-4xl font-bold">Tests</h1>
                        <div
                            class="flex gap-2 self-end text-right ml-auto items-center"
                            classList={{ hidden: tab() !== "unit" }}
                        >
                            <SearchButton
                                search={[get_search, set_search]}
                            ></SearchButton>
                            <button
                                class="btn text-sm self-end text-right ml-auto"
                                onClick={refetch}
                            >
                                <Icon name="refresh" />
                            </button>
                            <A
                                class="btn text-sm self-end text-right ml-auto"
                                href="/tests/new"
                            >
                                <Icon name="plus" class="lg:hidden!" />
                                <span class="not-lg:hidden">
                                    Create new test
                                </span>
                            </A>
                        </div>
                    </div>

                    <AlertBox
                        alert_signals={[get_alert, set_alert]}
                        hide_timeout={!get_alert()?.is_error ? 5000 : undefined}
                    ></AlertBox>

                    <div role="tablist" class="tabs tabs-border self-start">
                        <button
                            role="tab"
                            class="tab"
                            classList={{ "tab-active": tab() === "unit" }}
                            onClick={() => set_tab("unit")}
                        >
                            Unit tests
                        </button>
                        <button
                            role="tab"
                            class="tab"
                            classList={{ "tab-active": tab() === "composite" }}
                            onClick={() => set_tab("composite")}
                        >
                            Composite tests
                        </button>
                    </div>
                </div>

                <Show when={tab() === "composite"}>
                    <CompositeTests />
                </Show>

                <Show when={tab() === "unit"}>
                    <Show
                        when={!tests.loading}
                        fallback={
                            <div class="flex w-full my-8 justify-center">
                                <span class="loading loading-spinner loading-xl"></span>
                            </div>
                        }
                    >
                        <div
                            class="overflow-x-auto transition-all transition-discrete duration-500 starting:opacity-0 starting:scale-95"
                            ref={table_container}
                        >
                            <div class="table text-sm table-auto border-collapse">
                                <div class="table-header-group border-b-2 border-b-base-300">
                                    <div class="table-row font-bold bg-base-300 [&>div]:w-auto [&>div]:p-3 [&_div]:align-middle [&>div]:text-left [&>div]:rounded-none">
                                        <div class="table-cell rounded-tl-xl!"></div>

                                        <SortableColumnCell
                                            title="Name"
                                            field="name"
                                            table_sort={[
                                                get_table_sort,
                                                set_table_sort,
                                            ]}
                                        />
                                        <SortableColumnCell
                                            title="Description"
                                            field="description"
                                            table_sort={[
                                                get_table_sort,
                                                set_table_sort,
                                            ]}
                                        />
                                        <SortableColumnCell
                                            title="Target endpoint"
                                            field="target_endpoint_id"
                                            table_sort={[
                                                get_table_sort,
                                                set_table_sort,
                                            ]}
                                        />
                                        <div class="table-cell">Path</div>
                                        <div class="table-cell rounded-tr-xl!"></div>
                                    </div>
                                </div>
                                <div class="table-row-group [&>div]:even:bg-base-200 [&>div]:hover:bg-base-300 [&>div]:transition [&>div]:duration-200 [&>div]:hover:scale-101 [&>div]:hover:cursor-pointer">
                                    <Index
                                        each={tests_list()}
                                        fallback={
                                            <Portal mount={table_container!}>
                                                <div class="flex my-8 justify-center items-center text-center">
                                                    <p class="text-sm font-light">
                                                        No tests found with the
                                                        matching criteria.
                                                    </p>
                                                </div>
                                            </Portal>
                                        }
                                    >
                                        {(test, ix) => (
                                            <div
                                                class="table-row border-b border-b-base-300 [&_span]:text-xs [&_span]:lg:text-sm [&_div]:size-auto [&_div]:p-2 [&_div]:align-middle"
                                                onClick={() =>
                                                    navigate(
                                                        `/tests/${encodeURIComponent(test().test.name!)}`,
                                                        {
                                                            replace: false,
                                                            scroll: false,
                                                        },
                                                    )
                                                }
                                            >
                                                <div class="table-cell font-light pl-8! align-middle">
                                                    {ix}
                                                </div>
                                                <div class="table-cell font-bold">
                                                    {test().test.name}
                                                </div>
                                                <div class="table-cell">
                                                    {test().test.description}
                                                </div>
                                                <div class="table-cell">
                                                    {
                                                        test().test
                                                            .target_endpoint_id
                                                    }
                                                </div>
                                                <div class="table-cell font-mono pr-4!">
                                                    {test().path ?? "—"}
                                                </div>
                                                <div class="table-cell pr-4!">
                                                    <button
                                                        class="btn btn-xs"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            navigate(
                                                                `/tests/${encodeURIComponent(test().test.name!)}/run`,
                                                                {
                                                                    replace: false,
                                                                    scroll: false,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        <Icon
                                                            name="tests"
                                                            class="size-4"
                                                        />
                                                        Test
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </Index>
                                </div>
                            </div>
                        </div>
                    </Show>
                </Show>
            </div>
        </>
    );
};
