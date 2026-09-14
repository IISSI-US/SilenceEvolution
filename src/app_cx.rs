// SilenceEvolution
// Copyright (C) 2026 Oscar Alvarez Gonzalez

//!
//! The Silence's app context.
//! In order to manage Silence's app hot-reloading, a global application context is needed in order
//! to sync the Silence project's files and Waveless' runtime context.
//! The main use of this API is for Silence's internal executors. As an example, let's visualize
//! the inner workings of `NewEndpoint`, the internal endpoint that adds new user's endpoints:
//! `NewEndpoint` is defined at path `/api/manage/admin/endpoint` with the POST method, and set to capture
//! all request's params, enabling the handler to manage any arbitrary params, thus the endpoint
//! does not require to be tied with the actual endpoint schema definition (dynamic parameters).
//! The workflow is the following:
//! 1. Deserializes the JSON serialized request into `silence::endpoint::UserEndpoint`.
//! 2. Converts the `silence::endpoint::Endpoint` definition back to `waveless_commons::endpoint::Endpoint`.
//! 3. Acquires `waveless_executor::RuntimeCx`, adds the new Waveless' endpoint and rebuilds the router manager.
//! 4. If the previous step succeeded, appends the `silence::endpoint::Endpoint` definition of the endpoint
//! to `silence::AppCx` ― if it failed, there is an equivalent endpoint already loaded, so the new endpoint
//! is not valid.
//! 5. Serializes `CheapVec<silence::endpoint::Endpoint>` back into JSON and saves it into the file.
//!

use crate::*;

use config::*;

use project::EndpointGeneratorConfig;

use waveless_compiler::{COMPILER_CX, CompilerCx, generator::*};

use waveless_sql::generator::mysql::*;

pub type ManyByFile<T> = CheapVec<(Option<PathBuf>, CheapVec<T>)>;

#[derive(Constructor, Getters, Debug)]
#[getset(get = "pub")]
pub struct AppCx {
    config: RwLock<Config>,
    #[getset(skip)]
    simple_endpoints_by_file: RwLock<ManyByFile<SimpleEndpoint>>,
    endpoint_tests_by_file: RwLock<ManyByFile<EndpointTest>>,
    workspace_root: PathBuf,
}

impl AppCx {
    pub fn acquire() -> &'static Self {
        APP_CX
            .get()
            .ok_or(eyre!("App's context should have been initialized."))
            .unwrap()
    }

    /// Sets the `APP_CX`'s `OnceLock`. And sets Waveless' runtime context.
    /// NOTE: If app's context is set this method will panic.
    pub async fn set_global_cx(self) -> Result<()> {
        RuntimeCx::from_build(
            self.config()
                .read()
                .await
                .to_owned()
                .into_build(self.build_runtime_endpoints().await?),
        )
        .await?
        .set_cx();

        if !APP_CX.initialized() {
            APP_CX.set(self).unwrap();
        } else {
            panic!("App's context has already been initialized.");
        }

        Ok(())
    }

    /// Loads the Silence's app's settings into the Waveless' runtime context. Used when the runtime context
    /// is already initialized and needs to be mutated.
    /// NOTE: this method requires `waveless_executor::RuntimeCx` to be initialized otherwise it will panic.
    pub async fn set_runtime_config(&self) -> Result<()> {
        let mut runtime_build_guard = RuntimeCx::acquire().build().write().await;

        let virtual_build = self.config().read().await.to_owned().into_build(
            waveless_commons::endpoint::Endpoints::new_unchecked(CheapVec::new()),
        );

        *runtime_build_guard.config_mut() = virtual_build.config().to_owned();
        *runtime_build_guard.executor_mut() = virtual_build.executor().to_owned();
        *runtime_build_guard.databases_checksums_mut() =
            virtual_build.databases_checksums().to_owned();

        Ok(())
    }

    /// Builds the app's context by loading the project
    /// from the workspace's root.
    pub async fn from_workspace() -> Result<Option<Self>> {
        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);

        // Loads project's config.
        let config = match read(workspace_root.join("config.json")).await {
            Ok(file_buffer) => match serde_json::from_slice::<Config>(&file_buffer) {
                Ok(config) => config,
                Err(err) => Err(err).wrap_err("Cannot deserialize the `config.json` file.")?,
            },
            Err(_) => {
                warn!("Cannot find the `config.json` file.");
                return Ok(None);
            }
        };

        // Loads user-defined endpoints (Borrowed from the `waveless_compiler`).
        let endpoints_by_file = Self::load_from_dir::<_, SimpleEndpoint>("endpoints")
            .await?
            .unwrap_or_default();

        // Check whether an endpoint has been auto-generated.
        for (path, endpoints) in &endpoints_by_file {
            for endpoint in endpoints {
                if *endpoint.auto_generated() {
                    bail!(
                        "The endpoint `{}` from file `{}` cannot be marked as auto-generated.",
                        endpoint.id(),
                        path.to_owned().unwrap().display()
                    );
                }
            }
        }

        // Loads user's tests.
        let tests_by_file = Self::load_from_dir::<_, EndpointTest>("tests")
            .await?
            .unwrap_or_default();

        Ok(Some(Self {
            config: RwLock::new(config),
            simple_endpoints_by_file: RwLock::new(endpoints_by_file),
            endpoint_tests_by_file: RwLock::new(tests_by_file),
            workspace_root,
        }))
    }

    /// Syncs the app's config with the runtime build's config and saves current config state to the project's `config.json`.
    pub async fn set_config(&self) -> Result<()> {
        AppCx::acquire().set_runtime_config().await?;

        let config_guard = self.config().read().await;

        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);
        let project_file = workspace_root.join("config.json");

        let content = serde_json::to_string_pretty(&config_guard.to_owned())?;

        write(project_file, content).await?;

        Ok(())
    }

    /// Converts the Silence's app's endpoints (`SimpleEndpoint`) into Waveless' endpoints and discovers the database's schema to automatically generate endpoints.
    async fn build_runtime_endpoints(&self) -> Result<waveless_commons::endpoint::Endpoints> {
        // In the future, endpoint discovery will be `CompilerCx` independent.
        // In the meanwhile we do this as a workaround.
        let dummy_build = self.config.read().await.to_owned().into_build(
            waveless_commons::endpoint::Endpoints::new_unchecked(CheapVec::new()),
        );

        // Initialize CompilerCx if needed.
        if !COMPILER_CX.initialized() {
            CompilerCx::new(
                waveless_commons::project::Project::new(
                    dummy_build.config().to_owned(),
                    waveless_commons::project::Compiler::new(
                        CompactString::const_new(""),
                        CheapVec::from_iter([EndpointGeneratorConfig::new(
                            Arc::new(MySQLSchemaDiscovery::new(
                                "main".into(),
                                self.config()
                                    .read()
                                    .await
                                    .skip_discovery_tables()
                                    .to_owned(),
                            )),
                            false,
                        )]),
                    ),
                    dummy_build.executor().to_owned(),
                ),
                PathBuf::new(),
            )
            .set_cx();
        }

        // Adds internal endpoints.
        let mut endpoints = APP_INTERNAL_ENDPOINTS.to_owned(); // This can fail, as the endpoints might be invalid.

        // Converts user-defined endpoints.
        let simple_endpoints = self.simple_endpoints_by_file.read().await;

        endpoints.merge(
            waveless_commons::endpoint::Endpoints::new(
                simple_endpoints
                    .iter()
                    .map(|(_, endpoints)| endpoints.to_owned())
                    .flatten()
                    .map(|endpoint| -> waveless_commons::endpoint::Endpoint { endpoint.into() })
                    .collect::<CheapVec<waveless_commons::endpoint::Endpoint>>(),
            )?, // This could fail, as the user's endpoints might be invalid.
        )?;

        // Discover MySQL schema endpoints.
        let config_guard = self.config.read().await;

        let skip_endpoint_ids = config_guard.skip_endpoints_ids();

        endpoints.merge(
            GeneratedEndpoints::generate()
                .await?
                .get()
                .iter()
                .cloned()
                .map(|(_, (discovered_endpoints, _))| {
                    Endpoints::new_unchecked(
                        discovered_endpoints
                            .inner()
                            .iter()
                            .cloned()
                            .filter(|discovered_endpoint| {
                                !skip_endpoint_ids.contains(discovered_endpoint.id())
                            })
                            .collect::<CheapVec<Endpoint>>(),
                    )
                }) // won't add endpoints whose id is in `Config::skip_endpoints_ids`.
                .next()
                .unwrap_or(Endpoints::default()),
        )?;

        Ok(endpoints)
    }

    /// Returns an endpoint given it's id.
    pub async fn get_endpoint(
        &self,
        id: Option<CompactString>,
        route: Option<CompactString>,
        exactly_both: bool,
    ) -> Result<Option<(Option<PathBuf>, SimpleEndpoint)>> {
        for (target_path, endpoints) in self.get_endpoints().await? {
            for endpoint in endpoints {
                if match (id.to_owned(), route.to_owned(), exactly_both) {
                    (Some(id), None, _) => id == endpoint.id(),
                    (None, Some(route), _) => route == endpoint.route(),
                    (Some(id), Some(route), false) => {
                        id == endpoint.id() || route == endpoint.route()
                    }
                    (Some(id), Some(route), true) => {
                        id == endpoint.id() && route == endpoint.route()
                    }
                    _ => false,
                } {
                    return Ok(Some((target_path, endpoint)));
                }
            }
        }

        Ok(None)
    }

    /// Returns the user-defined (`SimpleEndpoint`), the auto-generated and internal endpoints that have been loaded into the app.
    /// NOTE: the internal login endpoint will be injected in this method.
    pub async fn get_endpoints(&self) -> Result<ManyByFile<SimpleEndpoint>> {
        let executor_build_guard = RuntimeCx::acquire().build().read().await;

        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);
        let endpoints_dir = workspace_root.join("endpoints");

        // Get user-defined endpoints by file.
        let mut simple_endpoints_by_file = self
            .simple_endpoints_by_file
            .read()
            .await
            .to_owned()
            .iter()
            .cloned()
            .collect::<ManyByFile<SimpleEndpoint>>();

        // Make paths relative to the project's endpoints folder.
        simple_endpoints_by_file
            .iter_mut()
            .for_each(|(path_buf, _)| {
                if let Some(path) = path_buf.to_owned() {
                    let path = Path::new(&path);
                    *path_buf = Some(
                        path.strip_prefix(endpoints_dir.to_owned())
                            .unwrap_or(path)
                            .to_path_buf(),
                    );
                }
            });

        // Get all the endpoints that have been injected and automatically generated.
        {
            let endpoints = executor_build_guard
                .endpoints()
                .inner()
                .iter()
                .filter(|endpoint| match endpoint.execution_target() {
                    ExecutionTarget::Http(http_target) => *http_target.auto_generated(),
                    ExecutionTarget::Socket(_) => false,
                })
                .cloned()
                .map(|endpoint| endpoint.try_into())
                .collect::<Result<CheapVec<SimpleEndpoint>>>()?;

            simple_endpoints_by_file.push((None, endpoints));
        }

        // Get all Waveless' internal endpoints.
        {
            let endpoints = INTERNAL_ENDPOINTS
                .iter()
                .map(|(_, endpoint)| endpoint)
                .cloned()
                .map(|endpoint| endpoint.try_into())
                .collect::<Result<CheapVec<SimpleEndpoint>>>()?;

            simple_endpoints_by_file.push((None, endpoints));
        }

        Ok(simple_endpoints_by_file)
    }

    /// Add an endpoint that will be loaded into the runtime and saved into the given file.
    /// NOTE: any modification of the endpoint file that hasn't been loaded into the app context will be lost.
    pub async fn add_endpoint(
        &self,
        target_path: CompactString,
        endpoint: SimpleEndpoint,
    ) -> Result<()> {
        if !target_path.ends_with(".json") {
            bail!("Target file doesn't end with `.json`.");
        }

        if *endpoint.auto_generated() {
            bail!("The endpoint cannot be marked as auto-generated.");
        }

        // Add the endpoint to the runtime context.
        {
            let mut executor_build_guard = RuntimeCx::acquire().build().write().await;
            let endpoints = executor_build_guard.endpoints_mut();

            endpoints.add(endpoint.to_owned().into())?; // This can fail, as the endpoint might already exist.
        }

        // Rebuild the router.
        RuntimeCx::acquire().build_router().await?;

        // Add the endpoint to the Silence's app context.
        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);

        let endpoints_dir = workspace_root.join("endpoints");

        let mut target_path = PathBuf::from(target_path);

        if !target_path.starts_with(&endpoints_dir) {
            target_path = endpoints_dir.join(target_path)
        };

        {
            let mut simple_endpoints_by_file_guard = self.simple_endpoints_by_file.write().await;

            match simple_endpoints_by_file_guard
                .iter_mut()
                .find(|(opt_file, _)| {
                    opt_file
                        .to_owned()
                        .map(|file| file == target_path)
                        .unwrap_or(false)
                }) {
                Some((_, simple_endpoints)) => {
                    // This flow assumes that the file already exists.
                    simple_endpoints.push(endpoint);
                }
                None => {
                    // While in this flow is not guaranteed that the file nor the directory exists.
                    let endpoints = CheapVec::from_vec(vec![endpoint.to_owned()]);

                    simple_endpoints_by_file_guard.push((Some(target_path.to_owned()), endpoints));
                }
            }
        }

        self.update_file(
            self.simple_endpoints_by_file.read().await,
            Some(target_path),
        )
        .await?;

        Ok(())
    }

    /// Modify endpoint's attributes.
    pub async fn set_endpoint(&self, id: CompactString, patch: SimpleEndpointPatch) -> Result<()> {
        let endpoints = RuntimeCx::acquire()
            .build()
            .write()
            .await
            .endpoints()
            .to_owned();

        let Some(endpoint) = endpoints
            .inner()
            .iter()
            .cloned()
            .find(|endpoint| *endpoint.id() == id)
        else {
            bail!("Couldn't find a loaded endpoint with the id {}", id);
        };

        // Check whether we are trying to modify an internal endpoint.
        if is_endpoint_internal(&endpoint) {
            bail!("Cannot modify an internal endpoint `{}`.", id);
        }

        // Convert endpoint from `waveless_commons::endpoint::Endpoint` back to Silence's `SimpleEndpoint`.
        let mut simple_endpoint = SimpleEndpoint::try_from(&endpoint)?;
        *simple_endpoint.auto_generated_mut() = false;

        // Delete the endpoint.
        let target_path = self
            .delete_endpoint(id)
            .await?
            .map(|target_path| target_path.to_str().unwrap().to_compact_string())
            .unwrap_or("default.json".to_compact_string());

        // Add the new endpoint.
        simple_endpoint.apply(patch);

        match self
            .add_endpoint(target_path.to_owned(), simple_endpoint)
            .await
        {
            Err(err) => {
                // Restore the old endpoint.
                self.add_endpoint(target_path, SimpleEndpoint::try_from(&endpoint)?)
                    .await?;

                Err(err)
            }
            _ => Ok(()),
        }?;

        Ok(())
    }

    /// Delete an endpoint from the runtime and from its file given its id.
    pub async fn delete_endpoint(&self, id: CompactString) -> Result<Option<PathBuf>> {
        let mut build = RuntimeCx::acquire().build().write().await;

        let endpoints = build.endpoints_mut().inner_mut();

        let Some((ix, endpoint)) = endpoints
            .iter()
            .cloned()
            .enumerate()
            .find(|(_, endpoint)| *endpoint.id() == id)
        else {
            bail!("Couldn't find a loaded endpoint with the id {}", id);
        };

        let auto_generated = match endpoint.execution_target() {
            ExecutionTarget::Http(http_target) => *http_target.auto_generated(),
            ExecutionTarget::Socket(_) => false,
        };

        // Check whether an internal endpoint is being removed.
        if is_endpoint_internal(&endpoint) {
            bail!("Cannot remove internal endpoint `{}`.", id);
        };

        // Remove the endpoint from the runtime context.
        let _ = endpoints.remove(ix);

        let mut target_path = None;

        // If the endpoint is auto-generated, the specific endpoint id will be skipped in subsequent endpoint discoveries.
        // Beware that by definition, the whole table isn't skipped only that specific endpoint.
        // Otherwise, if the endpoint is user-generated remove the endpoint from it's definition file.
        if auto_generated {
            let mut _config_guard = Self::acquire().config().write().await;
            _config_guard
                .skip_endpoints_ids_mut()
                .push(endpoint.id().to_owned());
        } else {
            // Find the simple endpoint and remove it.
            let mut simple_endpoint_by_files =
                Self::acquire().simple_endpoints_by_file.write().await;

            if let Some((ix, _target_path, endpoints)) = simple_endpoint_by_files
                .iter_mut()
                .map(|(target_path, endpoints)| (target_path.to_owned(), endpoints))
                .map(|(target_path, endpoint)| {
                    let ix = endpoint.iter().position(|endpoint| *endpoint.id() == id)?;

                    Some((ix, target_path, endpoint))
                })
                .filter(|val| val.is_some())
                .flatten()
                .next()
            {
                target_path = _target_path;

                endpoints.remove(ix);
            }

            if let Some(target_path) = target_path.to_owned() {
                self.update_file(simple_endpoint_by_files.downgrade(), Some(target_path))
                    .await?;
            }
        }

        drop(build); // drop the lock to be able to write to the runtime build.

        RuntimeCx::acquire().build_router().await?; // Rebuild the runtime's router.

        // If the endpoint was auto-generated it means that the app's config has been modified,
        // we have to set the config (cannot be done before because the lock is held by `build`).
        if auto_generated {
            AppCx::acquire().set_config().await?;
        }

        Ok(target_path)
    }

    /// Returns an endpoint test given it's id.
    pub async fn get_test(
        &self,
        name: CompactString,
    ) -> Result<Option<(Option<PathBuf>, EndpointTest)>> {
        for (target_path, endpoint_tests) in self.get_tests().await? {
            for endpoint_test in endpoint_tests {
                if endpoint_test.name() == name {
                    return Ok(Some((target_path, endpoint_test)));
                }
            }
        }

        Ok(None)
    }

    /// Returns user-defined tests.
    pub async fn get_tests(&self) -> Result<ManyByFile<EndpointTest>> {
        let mut endpoint_tests_by_file = self.endpoint_tests_by_file.read().await.to_owned();

        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);
        let tests_dir = workspace_root.join("tests");

        // Make paths relative to the project's endpoints folder.
        endpoint_tests_by_file.iter_mut().for_each(|(path_buf, _)| {
            if let Some(path) = path_buf.to_owned() {
                let path = Path::new(&path);
                *path_buf = Some(
                    path.strip_prefix(tests_dir.to_owned())
                        .unwrap_or(path)
                        .to_path_buf(),
                );
            }
        });

        Ok(endpoint_tests_by_file)
    }

    pub async fn add_test(
        &self,
        target_path: CompactString,
        endpoint_test: EndpointTest,
    ) -> Result<()> {
        if !target_path.ends_with(".json") {
            bail!("Target file doesn't end with `.json`.");
        }

        // Check whether a test with the same name exists.
        if self
            .get_test(endpoint_test.name().to_owned())
            .await?
            .is_some()
        {
            bail!(
                "A test with the name `{}` already exists.",
                endpoint_test.name()
            )
        };

        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);

        let tests_dir = workspace_root.join("tests");

        let mut target_path = PathBuf::from(target_path);

        if !target_path.starts_with(&tests_dir) {
            target_path = tests_dir.join(target_path)
        };

        {
            let mut endpoint_tests_by_file_guard = self.endpoint_tests_by_file.write().await;

            match endpoint_tests_by_file_guard
                .iter_mut()
                .find(|(opt_file, _)| {
                    opt_file
                        .to_owned()
                        .map(|file| file == target_path)
                        .unwrap_or(false)
                }) {
                Some((_, endpoint_tests)) => {
                    // This flow assumes that the file already exists.
                    endpoint_tests.push(endpoint_test);
                }
                None => {
                    // While in this flow is not guaranteed that the file nor the directory exists.
                    let endpoint_tests = CheapVec::from_vec(vec![endpoint_test.to_owned()]);

                    endpoint_tests_by_file_guard
                        .push((Some(target_path.to_owned()), endpoint_tests));
                }
            }
        }

        self.update_file(self.endpoint_tests_by_file.read().await, Some(target_path))
            .await?;

        Ok(())
    }

    pub async fn set_test(&self, name: CompactString, patch: EndpointTestPatch) -> Result<()> {
        let Some(mut endpoint_test) = self
            .endpoint_tests_by_file
            .read()
            .await
            .iter()
            .cloned()
            .flat_map(|(_, endpoint_tests)| endpoint_tests)
            .find(|endpoint_test| *endpoint_test.name() == name)
        else {
            bail!("Couldn't find a test with the id {}", name);
        };

        // Delete the test.
        let target_path = self.delete_test(name).await?;

        // Add the new endpoint.
        endpoint_test.apply(patch);

        self.add_test(
            target_path
                .map(|target_path| target_path.to_str().unwrap().to_compact_string())
                .unwrap_or("default.json".to_compact_string()),
            endpoint_test,
        )
        .await?;

        Ok(())
    }

    pub async fn delete_test(&self, name: CompactString) -> Result<Option<PathBuf>> {
        let mut endpoint_tests_guard = self.endpoint_tests_by_file.write().await;

        let Some((ix, target_path, endpoint_tests)) = endpoint_tests_guard
            .iter_mut()
            .map(|(target_path, endpoint_tests)| (target_path.to_owned(), endpoint_tests))
            .map(|(target_path, endpoint_tests)| {
                let ix = endpoint_tests
                    .iter()
                    .position(|endpoint_test| *endpoint_test.name() == name)?;

                Some((ix, target_path, endpoint_tests))
            })
            .filter(|val| val.is_some())
            .flatten()
            .next()
        else {
            bail!("Couldn't find a test with the id {}", name);
        };

        endpoint_tests.remove(ix);

        if let Some(target_path) = target_path.to_owned() {
            self.update_file(endpoint_tests_guard.downgrade(), Some(target_path))
                .await?;
        }

        Ok(target_path)
    }

    /// Loads all simple type files from a given project's folder (Borrowed from the `waveless_compiler`).
    async fn load_from_dir<P: AsRef<Path>, T: Clone + DeserializeOwned + Debug + Send + Sync>(
        dir: P,
    ) -> Result<Option<ManyByFile<T>>> {
        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);

        let target_dir = workspace_root.join(dir);

        if let Ok(target_dir_exists) = try_exists(&target_dir).await {
            match target_dir_exists {
                true => {
                    let mut generic_buff = ManyByFile::<T>::new();

                    generic_buff.append(
                        &mut Self::walk_dirs::<T>(target_dir)
                            .await?
                            .iter()
                            .cloned()
                            .map(|(path, endpoints)| (Some(path), endpoints))
                            .collect::<CheapVec<_>>(),
                    );

                    debug!("Deserialized: {:#?}", generic_buff);

                    Ok(Some(generic_buff))
                }
                false => {
                    warn!(
                        "Directory (`{}`) cannot be found. Omitting...",
                        target_dir.display()
                    );

                    Ok(None)
                }
            }
        } else {
            error!(
                "Cannot read directory (`{}`). Are you sure you have permissions?",
                target_dir.display()
            );
            Ok(None)
        }
    }

    /// Updates the contents of a simple type file from the app's context. This method explicitly skips
    /// data without a defined path (which means that it has been added at runtime and not meant to be saved).
    /// NOTE: if a `target_path` is given it will only update the data of that file.
    async fn update_file<'a, T: Clone + Serialize + Send + Sync>(
        &self,
        read_guard: RwLockReadGuard<'a, ManyByFile<T>>,
        target_path: Option<PathBuf>,
    ) -> Result<()> {
        let workspace_root = get_workspace_root("config.json").unwrap_or(current_dir()?);

        match target_path {
            Some(target_path) => {
                // Update only a specific file.

                // Check whether the file path is relative to the project.
                if !target_path.starts_with(&workspace_root) {
                    bail!(
                        "File's path (`{}`) is outside the current project's dir.",
                        target_path.display()
                    )
                };

                // Create all path's subdirectories if needed.
                create_dir_all(target_path.parent().unwrap()).await?;

                match read_guard.iter().find(|(opt_file, _)| {
                    opt_file
                        .to_owned()
                        .map(|file| file == *target_path)
                        .unwrap_or(false)
                }) {
                    Some((_, generic_buff)) => {
                        let content = serde_json::to_string_pretty(&generic_buff)?;

                        write(target_path, content).await?;

                        Ok(())
                    }
                    None => Err(eyre!(
                        "Target path does not exist in the current app context."
                    )),
                }
            }
            None => {
                // Update all files.
                for (target_path, generic_buff) in read_guard.iter() {
                    if let Some(target_path) = target_path {
                        // Check whether the file path is relative to the project.
                        if !target_path.starts_with(&workspace_root) {
                            bail!(
                                "File's path (`{}`) is outside the current project's dir.",
                                target_path.display()
                            )
                        };

                        // Create all path's subdirectories if needed.
                        create_dir_all(target_path.parent().unwrap()).await?;

                        let content = serde_json::to_string_pretty(&generic_buff)?;

                        write(target_path, content).await?;
                    }
                }
                Ok(())
            }
        }
    }

    /// Recursively walk and deserialize files through all subfolders in the given project's folder.
    fn walk_dirs<T: Clone + DeserializeOwned + Send + Sync>(
        dir: PathBuf,
    ) -> BoxFuture<'static, Result<CheapVec<(PathBuf, CheapVec<T>)>>> {
        Box::pin(async move {
            let mut des_buff = CheapVec::<(PathBuf, CheapVec<T>)>::new();

            if let Ok(mut dir) = read_dir(dir).await {
                while let Ok(Some(file_entry)) = dir.next_entry().await {
                    let entry_metadata = file_entry.metadata().await?;
                    match entry_metadata.is_dir() {
                        true => {
                            // Recurse into that directory.
                            match Self::walk_dirs(file_entry.path()).await {
                                Ok(inner_des) => des_buff.append(&mut inner_des.to_owned()),
                                Err(err) => return Err(err),
                            }
                        }
                        false
                            if file_entry
                                .file_name()
                                .to_str()
                                .map(|val| val.ends_with(".json"))
                                .unwrap_or(false) =>
                        {
                            match read(file_entry.path()).await {
                                Ok(file_buffer) => {
                                    match serde_json::from_slice::<CheapVec<T>>(&file_buffer) {
                                        Ok(des) => des_buff.push((file_entry.path(), des)),
                                        Err(err) => {
                                            Err(err).wrap_err(format!(
                                                "Cannot deserialize file `{}`.",
                                                file_entry.file_name().display(),
                                            ))?;
                                        }
                                    };
                                }
                                Err(err) => {
                                    Err(err).wrap_err(format!(
                                        "Cannot open the file `{}`.",
                                        file_entry.file_name().display(),
                                    ))?;
                                }
                            }
                        }
                        _ => debug!(
                            "Skipping file `{}` as it doesn't end with `.json`.",
                            file_entry.file_name().display()
                        ),
                    }
                }
            }

            Ok(des_buff)
        })
    }
}
