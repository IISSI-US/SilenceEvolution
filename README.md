<h1 style="font-size:4rem" align="center">Silence</h1>
<h3> An educational framework for deploying APIs (based on a MySQL schema) and web applications.</h3>

> **You can download the latest binaries from [releases](https://github.com/IISSI-US/SilenceEvolution/releases)**.

## Quick set up

1. Download and install _Silence_ from the _[releases](https://github.com/IISSI-US/SilenceEvolution/releases)_ section. (Make sure _Silence_ is in your shell's `PATH`).
2. Setup a _MySQL_ (or _MariaDB_) database.
3. Create a new _Silence_ project called `MyProject` by running:

```
$ silence new MyProject
```

> This new project will be filled with default settings in `config.json`, which will need to be changed later. 4. Access the project's directory (`cd MyProject`) and open the `config.json` file. 5. Replace all fields under `database_conn` when necessary. 6. Launch the server with `silence run`
