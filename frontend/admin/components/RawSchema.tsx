// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import {
    createEffect,
    createResource,
    type Accessor,
    type Setter,
    type ParentProps,
} from "solid-js";

import { loadGrammar } from "@arborium/arborium";

export default (
    props: {
        schema: [Accessor<string | undefined>, Setter<string | undefined>];
    } & ParentProps,
) => {
    const [get_schema, set_schema] = [
        () => props.schema[0](),
        (value: string | undefined) => props.schema[1](value),
    ];

    // Load JSON grammar.
    const [json_grammar] = createResource(async () => {
        return (await loadGrammar("json"))!;
    });

    return (
        <>
            <div class="overflow-auto overscroll-contain">
                <div class="grid grid-cols-1 box-border min-w-0 font-mono **:text-sm **:leading-6 overflow-hidden">
                    <div
                        class="bg-base-200/75 p-3 border border-base-300 col-start-1 row-start-1 rounded-2xl w-full h-full inset-0 backdrop-brightness-125 backdrop-blur-xs pointer-events-none whitespace-pre-wrap wrap-break-word z-10 min-w-0 overflow-hidden"
                        ref={async (element) => {
                            createEffect(async () => {
                                element.innerHTML =
                                    await json_grammar()?.highlight(
                                        get_schema() ?? "",
                                    )!;
                            });
                        }}
                    ></div>
                    <textarea
                        id="schema"
                        class="bg-transparent p-3 border text-transparent caret-info col-start-1 row-start-1 whitespace-pre-wrap w-full min-h-14 not-focus:text-transparent z-20 min-w-0 outline-0 resize-none"
                        spellcheck="false"
                        onKeyDown={(event) => {
                            let target = event.currentTarget;

                            if (event.key === "Tab") {
                                event.preventDefault();

                                let value = target.value,
                                    start = target.selectionStart,
                                    end = target.selectionEnd;
                                target.value =
                                    value.substring(0, start) +
                                    "\t" +
                                    value.substring(end);
                                target.selectionStart = target.selectionEnd =
                                    start + 1;
                            }
                        }}
                        value={get_schema() ?? ""}
                        placeholder="Schema"
                        onInput={async (event) => {
                            set_schema(event.currentTarget.value);
                        }}
                    />
                </div>
            </div>
        </>
    );
};
