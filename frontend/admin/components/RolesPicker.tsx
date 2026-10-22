// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

import { createSignal, For, onCleanup, Show } from "solid-js";

import { Portal } from "solid-js/web";

/**
 * Picks several roles: a button with the chosen ones that opens a list of checkboxes (the known
 * roles) plus a field to add a new one. Every change calls `on_change` with the new list. The list
 * is fixed to the viewport so the grid's scroll container doesn't clip it.
 */
export default (props: {
    roles: Array<string>;
    known_roles: Array<string>;
    disabled?: boolean;
    on_change: (roles: Array<string>) => void;
}) => {
    const [position, set_position] = createSignal<
        { top: number; left: number } | undefined
    >();

    let button: HTMLButtonElement | undefined;

    const close = () => set_position(undefined);

    const open = () => {
        const rect = button!.getBoundingClientRect();
        set_position({ top: rect.bottom + 4, left: rect.left });
    };

    const on_key = (event: KeyboardEvent) => {
        if (event.key === "Escape") close();
    };

    // The list is fixed where the button was: close it when the button moves, i.e. when the page or
    // a container of the button scrolls (not the console, which scrolls on every log line).
    const on_scroll = (event: Event) => {
        const target = event.target;
        if (
            target === document ||
            (target instanceof Node && target.contains(button!))
        )
            close();
    };

    document.addEventListener("keydown", on_key);
    window.addEventListener("scroll", on_scroll, true);
    onCleanup(() => {
        document.removeEventListener("keydown", on_key);
        window.removeEventListener("scroll", on_scroll, true);
    });

    // Known roles plus the chosen ones that aren't known (e.g. typed in the editor).
    const options = () =>
        [...new Set([...props.known_roles, ...props.roles])].sort();

    const toggle = (role: string) =>
        props.on_change(
            props.roles.includes(role)
                ? props.roles.filter((other) => other !== role)
                : [...props.roles, role],
        );

    const add = (input: HTMLInputElement) => {
        const role = input.value.trim();
        input.value = "";
        if (role.length !== 0 && !props.roles.includes(role))
            props.on_change([...props.roles, role]);
    };

    return (
        <>
            <button
                ref={button}
                class="btn btn-xs w-40 justify-between font-mono font-normal"
                title="Allowed roles"
                disabled={props.disabled}
                onClick={() => (position() ? close() : open())}
            >
                <span class="truncate">
                    {props.roles.length !== 0
                        ? props.roles.join(", ")
                        : "any role"}
                </span>
                <span class="text-base-content/50">▾</span>
            </button>

            <Show when={position()}>
                <Portal>
                    <div class="fixed inset-0 z-30" onClick={close} />
                    <div
                        class="fixed z-40 w-56 bg-base-100 border border-base-300 rounded-box shadow-lg p-2 flex flex-col gap-1 text-sm"
                        style={{
                            top: `${position()!.top}px`,
                            left: `${position()!.left}px`,
                        }}
                    >
                        <p class="text-xs text-base-content/60 px-1">
                            None checked: any role.
                        </p>
                        <For each={options()}>
                            {(role) => (
                                <label class="flex gap-2 items-center px-1 py-0.5 rounded cursor-pointer hover:bg-base-200 font-mono">
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        checked={props.roles.includes(role)}
                                        onChange={() => toggle(role)}
                                    />
                                    {role}
                                </label>
                            )}
                        </For>
                        <form
                            class="flex gap-1 pt-1 border-t border-base-200"
                            onSubmit={(event) => {
                                event.preventDefault();
                                add(
                                    event.currentTarget.querySelector("input")!,
                                );
                            }}
                        >
                            <input
                                class="input input-xs flex-1 font-mono"
                                placeholder="New role"
                            />
                            <button class="btn btn-xs" type="submit">
                                Add
                            </button>
                        </form>
                    </div>
                </Portal>
            </Show>
        </>
    );
};
