// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import AppCx from "@admin/AppCx";

import { run_unit_test, type UnitTestResult } from "@admin/tests/run";

import Dialog from "@admin/components/Dialog";
import Icon from "@admin/components/Icon";

import {
    createResource,
    createSignal,
    For,
    Index,
    Show,
    useContext,
} from "solid-js";

import { createStore, produce } from "solid-js/store";

export interface CompositeTest {
    name: string;
    description?: string | undefined;
    /** Names of the unit tests, in the order they run. */
    steps: Array<string>;
}

/** Result of a step: pending while the composite test runs, skipped after a failed step. */
type StepResult = UnitTestResult | "running" | "skipped";

const fetch_composite_tests = async (): Promise<Array<CompositeTest>> => {
    const res = await fetch("/_setup/composite_tests", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok)
        throw new Error(body.error ?? "Cannot load the composite tests.");
    return body as Array<CompositeTest>;
};

/**
 * Composite tests: ordered lists of unit tests run one after another, stopping at the first one
 * that fails. Saved in the project's `composite_tests.json` (see `src/composite_tests.rs`).
 */
export default () => {
    const app_cx = useContext(AppCx)!;

    const [tests] = app_cx.get_resource("tests");
    const [endpoints] = app_cx.get_resource("endpoints");

    const [composite_tests, { mutate, refetch }] = createResource(
        fetch_composite_tests,
    );

    const [error, set_error] = createSignal<string | undefined>();

    // Results of the last run of each composite test, by name.
    const [results, set_results] = createStore<
        Record<string, Array<StepResult>>
    >({});

    // New composite test modal.
    const [adding, set_adding] = createSignal(false);
    const [new_name, set_new_name] = createSignal("");
    const [new_description, set_new_description] = createSignal("");
    const [new_steps, set_new_steps] = createSignal<Array<string>>([]);

    const save = async (list: Array<CompositeTest>) => {
        const res = await fetch("/_setup/composite_tests", {
            method: "PUT",
            body: JSON.stringify(list),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            set_error(body.error ?? "Cannot save the composite tests.");
            return false;
        }

        set_error(undefined);
        mutate(list);
        return true;
    };

    const open_new = () => {
        set_new_name("");
        set_new_description("");
        set_new_steps([]);
        set_error(undefined);
        set_adding(true);
    };

    const toggle_step = (name: string) =>
        set_new_steps((steps) =>
            steps.includes(name)
                ? steps.filter((step) => step !== name)
                : [...steps, name],
        );

    const move_step = (ix: number, offset: number) =>
        set_new_steps((steps) => {
            const moved = [...steps];
            const target = ix + offset;
            if (target < 0 || target >= moved.length) return steps;
            [moved[ix], moved[target]] = [moved[target]!, moved[ix]!];
            return moved;
        });

    const add = async () => {
        const name = new_name().trim();

        if (name.length === 0) {
            set_error("The test needs a name.");
            return;
        }
        if (new_steps().length === 0) {
            set_error("Select at least one unit test.");
            return;
        }
        if (composite_tests()?.some((test) => test.name === name)) {
            set_error(`There's already a composite test named ${name}.`);
            return;
        }

        const description = new_description().trim();

        if (
            await save([
                ...(composite_tests() ?? []),
                {
                    name,
                    description: description.length ? description : undefined,
                    steps: new_steps(),
                },
            ])
        )
            set_adding(false);
    };

    const remove = async (name: string) => {
        if (!confirm(`Delete the composite test ${name}?`)) return;

        await save(
            (composite_tests() ?? []).filter((test) => test.name !== name),
        );
        set_results(produce((results) => delete results[name]));
    };

    const run = async (composite: CompositeTest) => {
        set_results(
            composite.name,
            composite.steps.map(() => "skipped"),
        );

        for (const [ix, step] of composite.steps.entries()) {
            set_results(composite.name, ix, "running");

            const test = tests()?.find(
                (test_by_file) => test_by_file.test.name === step,
            );

            const result: UnitTestResult = test
                ? await run_unit_test(test.test, endpoints() ?? [])
                : {
                      method: "",
                      route: "",
                      status: 0,
                      passed: false,
                      ms: 0,
                      body: undefined,
                      error: `The unit test ${step} doesn't exist.`,
                  };

            set_results(composite.name, ix, result);

            if (!result.passed) break;
        }
    };

    const summary = (name: string) => {
        const steps = results[name];
        if (!steps || steps.includes("running")) return undefined;

        const passed = steps.filter(
            (step) => typeof step === "object" && step.passed,
        ).length;

        return { passed, total: steps.length, ok: passed === steps.length };
    };

    return (
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <p class="text-sm text-base-content/60">
                    Unit tests run in order, as the test user; a composite test
                    stops at the first unit test that fails.
                </p>
                <div class="flex gap-2 ml-auto">
                    <button class="btn text-sm" onClick={refetch}>
                        <Icon name="refresh" />
                    </button>
                    <button class="btn text-sm" onClick={open_new}>
                        <Icon name="plus" />
                        Add test
                    </button>
                </div>
            </div>

            <Show when={error() && !adding()}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm">
                    {error()}
                </div>
            </Show>
            <Show when={composite_tests.error}>
                <div class="bg-error text-error-content rounded-box p-3 text-sm">
                    {(composite_tests.error as Error).message}
                </div>
            </Show>

            <For
                each={composite_tests()}
                fallback={
                    <p class="text-sm font-light text-center my-8">
                        No composite tests yet: add one with the unit tests to
                        run in order.
                    </p>
                }
            >
                {(composite) => (
                    <div class="border border-base-300 rounded-box bg-base-100 p-4 flex flex-col gap-3">
                        <div class="flex items-start gap-3">
                            <div>
                                <h2 class="font-bold">{composite.name}</h2>
                                <Show when={composite.description}>
                                    <p class="text-sm text-base-content/60">
                                        {composite.description}
                                    </p>
                                </Show>
                            </div>
                            <div class="flex gap-2 ml-auto items-center">
                                <Show when={summary(composite.name)}>
                                    {(summary) => (
                                        <span
                                            class="badge"
                                            classList={{
                                                "badge-success": summary().ok,
                                                "badge-error": !summary().ok,
                                            }}
                                        >
                                            {summary().passed}/{summary().total}{" "}
                                            passed
                                        </span>
                                    )}
                                </Show>
                                <button
                                    class="btn btn-sm"
                                    disabled={
                                        results[composite.name]?.includes(
                                            "running",
                                        ) ?? false
                                    }
                                    onClick={() => run(composite)}
                                >
                                    <Icon name="play" class="size-4" />
                                    Run
                                </button>
                                <button
                                    class="btn btn-sm btn-ghost"
                                    title="Delete"
                                    onClick={() => remove(composite.name)}
                                >
                                    <Icon name="trash" class="size-4" />
                                </button>
                            </div>
                        </div>

                        <ol class="flex flex-col gap-1 text-sm">
                            <Index each={composite.steps}>
                                {(step, ix) => {
                                    const result = () =>
                                        results[composite.name]?.[ix];
                                    const done = () => {
                                        const value = result();
                                        return typeof value === "object"
                                            ? value
                                            : undefined;
                                    };

                                    return (
                                        <li class="flex gap-3 items-baseline border-t border-base-200 pt-1">
                                            <span class="font-mono text-base-content/50 w-6 text-right">
                                                {ix + 1}.
                                            </span>
                                            <span class="font-semibold">
                                                {step()}
                                            </span>
                                            <Show when={done()}>
                                                {(done) => (
                                                    <span class="font-mono text-xs text-base-content/60">
                                                        {done().method}{" "}
                                                        {done().route}
                                                    </span>
                                                )}
                                            </Show>
                                            <span class="ml-auto flex gap-2 items-baseline">
                                                <Show
                                                    when={
                                                        result() === "running"
                                                    }
                                                >
                                                    <span class="loading loading-spinner loading-xs"></span>
                                                </Show>
                                                <Show
                                                    when={
                                                        result() === "skipped"
                                                    }
                                                >
                                                    <span class="text-base-content/40">
                                                        skipped
                                                    </span>
                                                </Show>
                                                <Show when={done()}>
                                                    {(done) => (
                                                        <>
                                                            <Show
                                                                when={
                                                                    !done()
                                                                        .passed &&
                                                                    done().error
                                                                }
                                                            >
                                                                <span class="text-error text-xs">
                                                                    {
                                                                        done()
                                                                            .error
                                                                    }
                                                                </span>
                                                            </Show>
                                                            <span class="font-mono text-xs">
                                                                {done().ms.toFixed(
                                                                    0,
                                                                )}{" "}
                                                                ms
                                                            </span>
                                                            <span
                                                                class="font-mono"
                                                                title={
                                                                    done()
                                                                        .expected_status !==
                                                                    undefined
                                                                        ? `Expected ${done().expected_status}`
                                                                        : "Expected a 2xx"
                                                                }
                                                            >
                                                                {done().status}
                                                            </span>
                                                            <span
                                                                classList={{
                                                                    "text-success":
                                                                        done()
                                                                            .passed,
                                                                    "text-error":
                                                                        !done()
                                                                            .passed,
                                                                }}
                                                            >
                                                                {done().passed
                                                                    ? "✓"
                                                                    : "✗"}
                                                            </span>
                                                        </>
                                                    )}
                                                </Show>
                                            </span>
                                        </li>
                                    );
                                }}
                            </Index>
                        </ol>
                    </div>
                )}
            </For>

            <Show when={adding()}>
                <Dialog on_close={() => set_adding(false)}>
                    <div class="flex flex-col gap-4">
                        <h2 class="text-2xl font-bold">New composite test</h2>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <label class="flex flex-col gap-1 text-sm">
                                Name
                                <input
                                    class="input w-full"
                                    value={new_name()}
                                    onInput={(event) =>
                                        set_new_name(event.currentTarget.value)
                                    }
                                />
                            </label>
                            <label class="flex flex-col gap-1 text-sm">
                                Description
                                <input
                                    class="input w-full"
                                    value={new_description()}
                                    onInput={(event) =>
                                        set_new_description(
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                            </label>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div class="flex flex-col gap-2">
                                <h3 class="font-bold">Unit tests</h3>
                                <p class="text-xs text-base-content/60">
                                    Select them in the order they must run.
                                </p>
                                <div class="border border-base-300 rounded-box max-h-80 overflow-y-auto">
                                    <For
                                        each={tests()}
                                        fallback={
                                            <p class="p-3 text-sm">
                                                There are no unit tests yet.
                                            </p>
                                        }
                                    >
                                        {(test_by_file) => {
                                            const name =
                                                test_by_file.test.name!;
                                            const position = () =>
                                                new_steps().indexOf(name);

                                            return (
                                                <label class="flex gap-3 items-center px-3 py-2 border-b border-base-200 cursor-pointer hover:bg-base-200">
                                                    <input
                                                        type="checkbox"
                                                        class="checkbox checkbox-sm"
                                                        checked={
                                                            position() !== -1
                                                        }
                                                        onChange={() =>
                                                            toggle_step(name)
                                                        }
                                                    />
                                                    <span class="flex flex-col">
                                                        <span class="font-semibold text-sm">
                                                            {name}
                                                        </span>
                                                        <span class="text-xs text-base-content/60">
                                                            {
                                                                test_by_file
                                                                    .test
                                                                    .target_endpoint_id
                                                            }
                                                        </span>
                                                    </span>
                                                    <Show
                                                        when={position() !== -1}
                                                    >
                                                        <span class="badge badge-sm ml-auto">
                                                            {position() + 1}
                                                        </span>
                                                    </Show>
                                                </label>
                                            );
                                        }}
                                    </For>
                                </div>
                            </div>

                            <div class="flex flex-col gap-2">
                                <h3 class="font-bold">Run order</h3>
                                <p class="text-xs text-base-content/60">
                                    Reorder them with the arrows.
                                </p>
                                <ol class="border border-base-300 rounded-box max-h-80 overflow-y-auto">
                                    <Index
                                        each={new_steps()}
                                        fallback={
                                            <li class="p-3 text-sm text-base-content/60">
                                                No unit tests selected.
                                            </li>
                                        }
                                    >
                                        {(step, ix) => (
                                            <li class="flex gap-2 items-center px-3 py-1 border-b border-base-200">
                                                <span class="font-mono text-base-content/50 w-6 text-right">
                                                    {ix + 1}.
                                                </span>
                                                <span class="text-sm font-semibold">
                                                    {step()}
                                                </span>
                                                <span class="ml-auto flex">
                                                    <button
                                                        class="btn btn-ghost btn-xs"
                                                        title="Move up"
                                                        disabled={ix === 0}
                                                        onClick={() =>
                                                            move_step(ix, -1)
                                                        }
                                                    >
                                                        <Icon
                                                            name="chevron-up"
                                                            class="size-4"
                                                        />
                                                    </button>
                                                    <button
                                                        class="btn btn-ghost btn-xs"
                                                        title="Move down"
                                                        disabled={
                                                            ix ===
                                                            new_steps().length -
                                                                1
                                                        }
                                                        onClick={() =>
                                                            move_step(ix, 1)
                                                        }
                                                    >
                                                        <Icon
                                                            name="chevron-up"
                                                            class="size-4 rotate-180"
                                                        />
                                                    </button>
                                                    <button
                                                        class="btn btn-ghost btn-xs"
                                                        title="Remove"
                                                        onClick={() =>
                                                            toggle_step(step())
                                                        }
                                                    >
                                                        <Icon
                                                            name="x"
                                                            class="size-4"
                                                        />
                                                    </button>
                                                </span>
                                            </li>
                                        )}
                                    </Index>
                                </ol>
                            </div>
                        </div>

                        <Show when={error()}>
                            <div class="bg-error text-error-content rounded-box p-3 text-sm">
                                {error()}
                            </div>
                        </Show>

                        <div class="flex justify-end gap-2">
                            <button
                                class="btn"
                                onClick={() => set_adding(false)}
                            >
                                Cancel
                            </button>
                            <button class="btn btn-primary" onClick={add}>
                                Save
                            </button>
                        </div>
                    </div>
                </Dialog>
            </Show>
        </div>
    );
};
