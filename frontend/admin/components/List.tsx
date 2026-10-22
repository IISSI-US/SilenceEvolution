// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import {
    createEffect,
    createSignal,
    Show,
    type Accessor,
    type Setter,
} from "solid-js";
import Icon from "@admin/components/Icon";

export const sort_by_column = (
    field: keyof any,
    table_sort: [
        Accessor<{
            field: keyof any;
            order: "asc" | "desc";
        }>,
        Setter<{
            field: keyof any;
            order: "asc" | "desc";
        }>,
    ],
) => {
    const [get_table_sort, set_table_sort] = [table_sort[0], table_sort[1]];

    return (event: MouseEvent) => {
        const target = event.currentTarget! as HTMLElement;

        let order = target.getAttribute("data-current-sort-order") as
            | "asc"
            | "desc"
            | null;

        if (get_table_sort().field === field)
            if (order !== null) order = order === "asc" ? "desc" : "asc";

        set_table_sort({
            field: field,
            order: order ?? "asc",
        });

        target.setAttribute("data-current-sort-order", order ?? "asc");
    };
};

export const SortableColumnCell = (props: {
    title: string;
    field: keyof any;
    classList?: {
        [k: string]: boolean | undefined;
    };
    table_sort: [
        Accessor<{
            field: keyof any;
            order: "asc" | "desc";
        }>,
        Setter<{
            field: keyof any;
            order: "asc" | "desc";
        }>,
    ];
}) => {
    const [get_table_sort, _] = [props.table_sort[0], props.table_sort[1]];

    const [show_icon, set_show_icon] = createSignal<boolean>(false);

    createEffect(() => {
        if (get_table_sort().field === props.field) set_show_icon(true);
        else set_show_icon(false);
    });

    return (
        <>
            <div
                class="table-cell btn btn-ghost"
                classList={props.classList}
                onClick={sort_by_column(props.field, props.table_sort)}
                data-current-sort-order="asc"
            >
                <div class="flex items-center">
                    <span class="mr-auto">{props.title}</span>
                    <Show when={show_icon()}>
                        <Icon name={get_table_sort().order === "asc" ? "chevron" : "chevron-up"} class="ml-left" />
                    </Show>
                </div>
            </div>
        </>
    );
};
