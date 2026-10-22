// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import {
    createEffect,
    createSignal,
    Show,
    type Accessor,
    type Setter,
} from "solid-js";

export interface AlertStruct {
    value: string;
    is_error?: boolean;
}

export default (props: {
    alert_signals: [
        Accessor<AlertStruct | undefined>,
        Setter<AlertStruct | undefined>,
    ];
    hide_timeout?: number | undefined;
}) => {
    const [get_alert, set_alert] = [
        () => props.alert_signals[0](),
        (value: AlertStruct | undefined) => props.alert_signals[1](value),
    ];

    let dismiss_timeout_id: number | undefined = undefined;

    const [debounced_alert, set_debounced_alert] = createSignal<
        AlertStruct | undefined
    >(get_alert());

    createEffect(() => {
        if (get_alert() !== undefined && props.hide_timeout !== undefined) {
            clearTimeout(dismiss_timeout_id);

            if (props.hide_timeout !== undefined) {
                dismiss_timeout_id = setTimeout(
                    () => {
                        set_alert(undefined);
                    },
                    props.hide_timeout,
                    "id",
                ) as unknown as number;
            }
        }
    });

    createEffect(() => {
        if (get_alert() !== undefined) set_debounced_alert(get_alert());
        else
            setTimeout(() => {
                set_debounced_alert(get_alert());
            }, 500);
    });

    return (
        <>
            <div
                class="flex flex-col bg-base-200/75 w-full min-h-12 border border-base-300 text-info not-dark:text-black text-center justify-center items-center backdrop-blur-xs shadow-sm rounded-2xl! my-2 p-2 cursor-pointer transition-all ease-out transition-discrete duration-500"
                classList={{
                    "invisible opacity-0 min-h-0! h-0! my-0! p-0! *:opacity-0 *:scale-25 overflow-hidden pointer-events-none":
                        get_alert() === undefined,
                    "bg-red-800 border-red-500 text-white":
                        get_alert()?.is_error,
                }}
                onClick={() => set_alert(undefined)}
            >
                <div class="transition-all duration-500">
                    <Show when={debounced_alert()?.is_error}>
                        <span class="text-sm font-semibold">
                            An error has occurred.{" "}
                        </span>
                    </Show>
                    <span class="text-sm font-semibold">
                        {debounced_alert()?.value}
                    </span>
                </div>
            </div>
        </>
    );
};
