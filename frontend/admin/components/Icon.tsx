// SilenceEvolution
// Copyright (C) 2026 DEAL research group, Universidad de Sevilla

/** Icon from the sprite (`frontend/public/internal_assets/icons.svg`) by its symbol id. */
export default (props: { name: string; class?: string }) => (
    <svg class={`icon ${props.class ?? ""}`} aria-hidden="true">
        <use href={`/internal_assets/icons.svg#${props.name}`} />
    </svg>
);
