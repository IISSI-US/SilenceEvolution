// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import Authentication from "@admin/Authentication";
import { AppCxProvider } from "@admin/AppCx";

import Admin from "@admin/Admin";

import ListEndpoint from "@admin/endpoints/List";
import ModifyEndpoint from "@admin/endpoints/Modify";

import ListTests from "@admin/tests/List";

import TestEndpoint from "@admin/tests/Test";

import ListUsers from "@admin/users/List";
import ModifyUser from "@admin/users/Modify";

import Config from "./Config";

import { render } from "solid-js/web";

import { Router, Route } from "@solidjs/router";

// The panel is served at `/admin` and `/admin2`.
const ADMIN_BASE = location.pathname.startsWith("/admin2")
    ? "/admin2"
    : "/admin";

const root = document.getElementById("root");

render(
    () => (
        <AppCxProvider>
            <Router root={Admin} base={ADMIN_BASE}>
                <Route path="/*" component={ListEndpoint} />
                <Route path="/endpoints" component={ListEndpoint}>
                    <Route path="/*" />
                    <Route path="/:id">
                        <Route path="/modify" component={ModifyEndpoint} />
                        <Route path="/test" component={TestEndpoint} />
                    </Route>
                    <Route path="/new" component={ModifyEndpoint} />
                </Route>
                <Route path="/tests" component={ListTests}>
                    <Route path="/*" />
                    <Route path="/:name" component={TestEndpoint} />
                    <Route path="/new" component={TestEndpoint} />
                </Route>
                <Route path="/users" component={ListUsers}>
                    <Route path="/*" />
                    <Route path="/:id" component={ModifyUser} />
                    <Route path="/new" component={ModifyUser} />
                </Route>
                <Route path="/config" component={Config} />
                <Route path="/authentication" component={Authentication} />
            </Router>
        </AppCxProvider>
    ),
    root!,
);
