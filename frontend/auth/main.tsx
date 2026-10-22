// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

import Auth from "./Auth";

import Login from "./Login";
import Signup from "./Signup";

import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

const root = document.getElementById("root");

render(
    () => (
        <Router root={Auth} base={location.pathname.startsWith("/auth2") ? "/auth2" : "/auth"}>
            <Route path="/*" component={Login} />
            <Route path="/signup" component={Signup} />
        </Router>
    ),
    root!,
);
