// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import {
    createEffect,
    createSignal,
    Show,
    type Accessor,
    type Setter,
} from "solid-js";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
            {/* Informative messages read as the page's description; errors keep a box. */}
            <div
                class="flex flex-col w-full mb-4 transition-all ease-out transition-discrete duration-500"
                classList={{
                    "invisible opacity-0 min-h-0! h-0! my-0! p-0! *:opacity-0 overflow-hidden pointer-events-none":
                        get_alert() === undefined,
                    "text-base-content/60": !get_alert()?.is_error,
                    "bg-error text-error-content rounded-box p-3 cursor-pointer":
                        get_alert()?.is_error,
                }}
                onClick={() => get_alert()?.is_error && set_alert(undefined)}
            >
                <div class="transition-all duration-500">
                    <Show when={debounced_alert()?.is_error}>
                        <span class="text-sm font-semibold">
                            An error has occurred.{" "}
                        </span>
                    </Show>
                    <span class="text-sm">
                        {capitalize(
                            (debounced_alert()?.value ?? "").replace(
                                /^Help:\s*/,
                                "",
                            ),
                        )}
                    </span>
                </div>
            </div>
        </>
    );
};
