// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import { type Accessor, type Setter } from "solid-js";
import Icon from "@admin/components/Icon";

export default (props: {
    search: [Accessor<string | undefined>, Setter<string | undefined>];
}) => {
    const [get_search, set_search] = [
        () => props.search[0](),
        (value: string | undefined) => props.search[1](value),
    ];

    return (
        <>
            <button
                class="btn text-sm self-end text-right ml-auto"
                classList={{
                    "btn-primary":
                        get_search() !== undefined &&
                        get_search()?.length !== 0,
                }}
                popovertarget="search-dropdown"
                style="anchor-name:--search-dropdown"
            >
                <Icon name="search" />
            </button>
            <ul
                id="search-dropdown"
                class="dropdown menu w-64 rounded-box bg-base-200 border-base-300 border shadow-lg opacity-0 [&:popover-open]:opacity-100 starting:opacity-0 transition-all transition-discrete duration-200"
                style="position-anchor:--search-dropdown; inset: auto; align-self: anchor-center; justify-self: anchor-left; margin: 0.5rem;"
                onMouseLeave={(event) =>
                    (event.currentTarget as HTMLUListElement).togglePopover()
                }
                popover
            >
                <li>
                    <input
                        class="input"
                        placeholder="Search"
                        onInput={(event) =>
                            set_search(event.currentTarget.value ?? undefined)
                        }
                        onFocus={(event) => {
                            event.currentTarget.value = "";
                            set_search(undefined);
                        }}
                        autofocus
                    ></input>
                </li>
            </ul>
        </>
    );
};
